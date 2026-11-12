"""Loudness metering (ITU-R BS.1770), true-peak, and vectorised dynamics."""
from __future__ import annotations

import numpy as np
from scipy import signal
from scipy.ndimage import maximum_filter1d, uniform_filter1d

from .dsp import SR, F32

# BS.1770 K-weighting at 48 kHz: high shelf, then RLB high-pass.
_K_SOS = np.array([
    [1.53512485958697, -2.69169618940638, 1.19839281085285, 1.0, -1.69065929318241, 0.73248077421585],
    [1.0, -2.0, 1.0, 1.0, -1.99004745483398, 0.99007225036621],
])


def k_weight(x) -> np.ndarray:
    return signal.sosfilt(_K_SOS, np.asarray(x, dtype=np.float64), axis=0)


def _block_powers(xk, block: float, hop: float, sr: int = SR) -> np.ndarray:
    """Channel-summed mean square in sliding blocks of a K-weighted signal."""
    if xk.ndim == 1:
        xk = xk[:, None]
    p = np.sum(xk * xk, axis=1)
    nb = int(round(block * sr))
    nh = int(round(hop * sr))
    if len(p) < nb:
        return np.array([float(np.mean(p))]) if len(p) else np.array([0.0])
    cs = np.concatenate([[0.0], np.cumsum(p, dtype=np.float64)])
    starts = np.arange(0, len(p) - nb + 1, nh)
    return (cs[starts + nb] - cs[starts]) / nb


def _to_lufs(p) -> np.ndarray:
    return -0.691 + 10.0 * np.log10(np.maximum(p, 1e-12))


def integrated_lufs(x, sr: int = SR) -> float:
    """Gated integrated loudness (BS.1770-4). Returns -inf-ish (-120) for silence."""
    z = _block_powers(k_weight(x), 0.4, 0.1, sr)
    l = _to_lufs(z)
    keep = l > -70.0
    if not np.any(keep):
        return -120.0
    rel = _to_lufs(np.mean(z[keep])) - 10.0
    keep2 = keep & (l > rel)
    if not np.any(keep2):
        return -120.0
    return float(_to_lufs(np.mean(z[keep2])))


def short_term_lufs(x, win: float = 3.0, hop: float = 0.5, sr: int = SR, prefiltered: bool = False) -> np.ndarray:
    xk = x if prefiltered else k_weight(x)
    return _to_lufs(_block_powers(xk, win, hop, sr))


def max_window_level(x, win: float = 0.125, sr: int = SR):
    """Loudest short window: returns (K-weighted dB, unweighted dB).

    This is the meter used to give one-shots a common nominal level.
    """
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 1:
        x = x[:, None]
    n = len(x)
    w = max(8, min(int(win * sr), n))
    out = []
    for sig in (k_weight(x), x):
        p = np.sum(sig * sig, axis=1)
        cs = np.concatenate([[0.0], np.cumsum(p)])
        m = np.max(cs[w:] - cs[:-w]) / w if n > w else float(np.sum(p)) / w
        out.append(10.0 * np.log10(max(m, 1e-14)))
    return out[0] - 0.691, out[1]


def true_peak_db(x, os: int = 4, sr: int = SR, chunk: int = 1 << 20) -> float:
    """Inter-sample (true) peak in dBTP via polyphase oversampling."""
    x = np.asarray(x)
    if x.ndim == 1:
        x = x[:, None]
    pk = 0.0
    margin = 256
    for s in range(0, len(x), chunk):
        a = max(0, s - margin)
        b = min(len(x), s + chunk + margin)
        seg = x[a:b]
        if not np.any(seg):
            continue
        up = signal.resample_poly(seg.astype(np.float64), os, 1, axis=0)
        pk = max(pk, float(np.max(np.abs(up))))
    return 20.0 * np.log10(max(pk, 1e-12))


def oversampled_peak_env(x, os: int = 4, chunk: int = 1 << 20) -> np.ndarray:
    """Per-sample true-peak envelope (max over channels and over the os sub-samples)."""
    x = np.asarray(x)
    if x.ndim == 1:
        x = x[:, None]
    n = len(x)
    env = np.empty(n, dtype=np.float32)
    margin = 256
    for s in range(0, n, chunk):
        a = max(0, s - margin)
        b = min(n, s + chunk + margin)
        up = np.abs(signal.resample_poly(x[a:b].astype(np.float32), os, 1, axis=0)).max(axis=1)
        e = up.reshape(-1, os).max(axis=1)
        e = np.maximum(e, np.abs(x[a:b]).max(axis=1))
        env[s:min(n, s + chunk)] = e[s - a:s - a + min(chunk, n - s)]
    return env


def _release_db(gr_db: np.ndarray, rate_db_s: float, sr: int = SR) -> np.ndarray:
    """y[n] = max(gr[n], y[n-1] - r): instant attack, linear-in-dB release."""
    r = rate_db_s / sr
    ramp = r * np.arange(len(gr_db), dtype=np.float64)
    return np.maximum.accumulate(gr_db + ramp) - ramp


def compressor_gain(x, thresh_db: float, ratio: float = 3.0, knee_db: float = 6.0, attack: float = 0.008,
                    release_db_s: float = 70.0, rms_win: float = 0.006, sr: int = SR) -> np.ndarray:
    """Feed-forward soft-knee compressor; returns the per-sample linear gain."""
    x = np.asarray(x, dtype=np.float64)
    mono = x if x.ndim == 1 else np.max(np.abs(x), axis=1)
    a = np.exp(-1.0 / (rms_win * sr))
    p = signal.lfilter([1.0 - a], [1.0, -a], mono * mono)
    lev = 10.0 * np.log10(np.maximum(p, 1e-12))
    over = lev - thresh_db
    slope = 1.0 - 1.0 / ratio
    gr = np.where(over <= -knee_db / 2, 0.0,
                  np.where(over >= knee_db / 2, over * slope,
                           slope * (over + knee_db / 2) ** 2 / (2.0 * max(knee_db, 1e-6))))
    gr = _release_db(gr, release_db_s, sr)
    b = np.exp(-1.0 / (attack * sr))
    gr = signal.lfilter([1.0 - b], [1.0, -b], gr)
    return (10.0 ** (-gr / 20.0)).astype(F32)


def limiter_gain(x, ceiling_db: float = -1.2, lookahead: float = 0.004, release_db_s: float = 60.0,
                 sr: int = SR, os: int = 4) -> np.ndarray:
    """Look-ahead true-peak limiter gain curve (linked stereo).

    The required reduction is held from `lookahead` before each peak until half
    a window after it, released linearly in dB, then smoothed with a triangular
    window that fits inside the hold, so the smoothed gain never falls short.
    """
    env = oversampled_peak_env(x, os=os)
    ceil = 10.0 ** (ceiling_db / 20.0)
    gr = 20.0 * np.log10(np.maximum(env / ceil, 1.0)).astype(np.float64)
    if not np.any(gr > 0):
        return np.ones(len(env), dtype=F32)
    L = max(8, int(lookahead * sr))
    half = L // 2
    size = L + half + 1                       # window covers [n - half, n + L]
    origin = -((L - half) // 2)               # shift the window toward the future
    gr = maximum_filter1d(gr, size=size, origin=origin, mode="nearest")
    gr = _release_db(gr, release_db_s, sr)
    gr = uniform_filter1d(gr, size=max(2, half), mode="nearest")
    gr = uniform_filter1d(gr, size=max(2, half), mode="nearest")
    return (10.0 ** (-gr / 20.0)).astype(F32)


def deess_gain(x, sr: int = SR, f_lo: float = 5200.0, f_hi: float = 10500.0, thresh_db: float = -32.0,
               max_red_db: float = 6.0, amount: float = 0.6):
    """Split-band de-esser. Returns (sibilant_band, band_gain); y = x + band*(g-1).

    The band is taken with a linear-phase FIR so the split recombines exactly.
    """
    x = np.asarray(x, dtype=np.float64)
    taps = 255
    h = signal.firwin(taps, [f_lo, min(f_hi, 0.48 * sr)], pass_zero=False, fs=sr)
    band = signal.fftconvolve(x, h, mode="same")
    a = np.exp(-1.0 / (0.004 * sr))
    p = signal.lfilter([1.0 - a], [1.0, -a], band * band)
    lev = 10.0 * np.log10(np.maximum(p, 1e-12))
    gr = np.clip((lev - thresh_db) * amount, 0.0, max_red_db)
    gr = _release_db(gr, 150.0, sr)
    b = np.exp(-1.0 / (0.002 * sr))
    gr = signal.lfilter([1.0 - b], [1.0, -b], gr)
    return band.astype(F32), (10.0 ** (-gr / 20.0)).astype(F32)


def active_rms_db(x, sr: int = SR, win: float = 0.05, gate_db: float = -45.0) -> float:
    """RMS of the non-silent part of a (speech) signal, in dBFS."""
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 2:
        x = x.mean(axis=1)
    w = max(1, int(win * sr))
    nblk = len(x) // w
    if nblk == 0:
        return -120.0
    p = np.mean(x[:nblk * w].reshape(nblk, w) ** 2, axis=1)
    keep = p > 10.0 ** (gate_db / 10.0)
    if not np.any(keep):
        return -120.0
    return float(10.0 * np.log10(np.mean(p[keep])))
