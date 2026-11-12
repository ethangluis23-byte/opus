"""Core DSP helpers shared by every generator in the pipeline.

Everything is numpy/scipy, vectorised, deterministic (callers pass seeded
generators) and works at 48 kHz.  Mono signals are shape (n,), stereo (n, 2).
"""
from __future__ import annotations

import functools
import hashlib
import json

import numpy as np
from scipy import fft as sfft
from scipy import signal
from scipy.interpolate import CubicSpline, PchipInterpolator

SR = 48000
F32 = np.float32
TAU = 2.0 * np.pi


# ----------------------------------------------------------------- seeds ---

def stable_seed(*parts) -> int:
    s = json.dumps(parts, sort_keys=True, separators=(",", ":"), default=str)
    return int.from_bytes(hashlib.sha256(s.encode()).digest()[:8], "little")


def make_rng(*parts) -> np.random.Generator:
    return np.random.default_rng(stable_seed(*parts))


# ------------------------------------------------------------- envelopes ---

def n_of(sec: float, sr: int = SR) -> int:
    return max(1, int(round(float(sec) * sr)))


def cos_ramp(n: int, up: bool = True) -> np.ndarray:
    if n <= 0:
        return np.zeros(0, F32)
    r = (0.5 - 0.5 * np.cos(np.pi * (np.arange(n) + 0.5) / n)).astype(F32)
    return r if up else r[::-1]


def fade(x, fin: float = 0.005, fout: float = 0.01, sr: int = SR) -> np.ndarray:
    """Raised-cosine fade in/out (seconds). Returns a float32 copy."""
    y = np.array(x, dtype=F32, copy=True)
    n = len(y)
    a = min(int(fin * sr), n // 2)
    b = min(int(fout * sr), n // 2)
    if a > 0:
        r = cos_ramp(a)
        y[:a] *= r[:, None] if y.ndim == 2 else r
    if b > 0:
        r = cos_ramp(b, up=False)
        y[n - b:] *= r[:, None] if y.ndim == 2 else r
    return y


def bpc(n: int, pts, kind: str = "pchip") -> np.ndarray:
    """Breakpoint curve. pts = [(u, value), ...] with u in 0..1."""
    us = np.array([p[0] for p in pts], dtype=float)
    vs = np.array([p[1] for p in pts], dtype=float)
    u = np.linspace(0.0, 1.0, n)
    if kind == "linear" or len(pts) < 3:
        return np.interp(u, us, vs)
    return PchipInterpolator(us, vs)(u)


def env_ar(n: int, attack: float, release: float, sr: int = SR, hold_level: float = 1.0) -> np.ndarray:
    """Flat envelope with raised-cosine attack and release (seconds)."""
    e = np.full(n, hold_level, dtype=F32)
    a = min(int(attack * sr), n // 2)
    r = min(int(release * sr), n - a)
    if a > 0:
        e[:a] *= cos_ramp(a)
    if r > 0:
        e[n - r:] *= cos_ramp(r, up=False)
    return e


def exp_decay(n: int, tau: float, sr: int = SR) -> np.ndarray:
    return np.exp(-np.arange(n) / (tau * sr)).astype(F32)


def smooth_noise(n: int, rng, rate: float, sr: int = SR) -> np.ndarray:
    """Band-limited random process, roughly N(0, 1), bandwidth ~`rate` Hz."""
    dur = n / sr
    m = int(np.ceil(dur * rate * 2.0)) + 8
    pts = rng.standard_normal(m)
    cr = float(min(sr, max(200.0, rate * 40.0)))
    k = int(np.ceil(dur * cr)) + 2
    xc = np.arange(k) / cr * (rate * 2.0)
    yc = CubicSpline(np.arange(m), pts)(xc)
    y = np.interp(np.arange(n) * (cr / sr), np.arange(k), yc)
    return y.astype(F32)


def gust_env(n: int, rng, rate: float = 0.15, depth: float = 0.7, power: float = 1.5) -> np.ndarray:
    """Slow positive envelope in ~[1-depth, 1] for wind-like motion."""
    g = smooth_noise(n, rng, rate) * 0.6 + smooth_noise(n, rng, rate * 3.1) * 0.3
    g = 0.5 + 0.5 * np.tanh(g * 1.2)
    g = g ** power
    return (1.0 - depth + depth * g).astype(F32)


# ----------------------------------------------------------------- noise ---

def white(n: int, rng) -> np.ndarray:
    return rng.standard_normal(n, dtype=np.float32)


def shaped_noise(n: int, rng, mag_fn, sr: int = SR, normalize: bool = True) -> np.ndarray:
    """Gaussian noise with an arbitrary magnitude spectrum mag_fn(freqs)."""
    nfft = sfft.next_fast_len(max(n, 64), real=True)
    X = sfft.rfft(rng.standard_normal(nfft, dtype=np.float32))
    f = sfft.rfftfreq(nfft, 1.0 / sr)
    X *= np.asarray(mag_fn(f), dtype=np.float32)
    y = sfft.irfft(X, nfft)[:n]
    if normalize:
        y = y / (np.sqrt(np.mean(y * y)) + 1e-12)
    return y.astype(F32)


def mag_band(f, lo: float, hi: float, order: float = 2.0):
    """Butterworth-like band magnitude."""
    f = np.maximum(f, 1e-3)
    m = np.ones_like(f)
    if lo and lo > 0:
        m = m / np.sqrt(1.0 + (lo / f) ** (2 * order))
    if hi and hi > 0:
        m = m / np.sqrt(1.0 + (f / hi) ** (2 * order))
    return m


def mag_slope(f, db_oct: float, ref: float = 1000.0):
    f = np.maximum(f, 10.0)
    return (f / ref) ** (db_oct / 6.0206)


def mag_peak(f, fc: float, q: float, gain: float = 1.0):
    """Resonant peak (Lorentzian) added on top of a flat response."""
    bw = fc / q
    return gain / np.sqrt(1.0 + ((f - fc) / (0.5 * bw)) ** 2)


def pink(n: int, rng) -> np.ndarray:
    return shaped_noise(n, rng, lambda f: mag_slope(f, -3.0) * mag_band(f, 25.0, 0))


def brown(n: int, rng) -> np.ndarray:
    return shaped_noise(n, rng, lambda f: mag_slope(f, -6.0) * mag_band(f, 25.0, 0))


def band_noise(n: int, rng, lo: float, hi: float, order: float = 2.0, slope: float = 0.0) -> np.ndarray:
    return shaped_noise(n, rng, lambda f: mag_band(f, lo, hi, order) * mag_slope(f, slope))


# --------------------------------------------------------------- filters ---

@functools.lru_cache(maxsize=1024)
def _butter(kind: str, fc, order: int, sr: int = SR):
    return signal.butter(order, fc, btype=kind, fs=sr, output="sos")


def _clampf(fc: float, sr: int = SR) -> float:
    return float(min(max(fc, 5.0), 0.49 * sr))


def lp(x, fc: float, order: int = 2, sr: int = SR):
    return signal.sosfilt(_butter("low", round(_clampf(fc, sr), 2), order, sr), x, axis=0).astype(F32)


def hp(x, fc: float, order: int = 2, sr: int = SR):
    return signal.sosfilt(_butter("high", round(_clampf(fc, sr), 2), order, sr), x, axis=0).astype(F32)


def bp(x, lo: float, hi: float, order: int = 2, sr: int = SR):
    lo = _clampf(lo, sr)
    hi = _clampf(max(hi, lo * 1.01), sr)
    return signal.sosfilt(_butter("band", (round(lo, 2), round(hi, 2)), order, sr), x, axis=0).astype(F32)


def _rbj(kind: str, f0: float, gain_db: float, q: float, sr: int = SR):
    A = 10.0 ** (gain_db / 40.0)
    w0 = TAU * _clampf(f0, sr) / sr
    cw, sw = np.cos(w0), np.sin(w0)
    alpha = sw / (2.0 * q)
    if kind == "peak":
        b = [1 + alpha * A, -2 * cw, 1 - alpha * A]
        a = [1 + alpha / A, -2 * cw, 1 - alpha / A]
    elif kind == "lowshelf":
        sq = 2.0 * np.sqrt(A) * alpha
        b = [A * ((A + 1) - (A - 1) * cw + sq), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - sq)]
        a = [(A + 1) + (A - 1) * cw + sq, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - sq]
    elif kind == "highshelf":
        sq = 2.0 * np.sqrt(A) * alpha
        b = [A * ((A + 1) + (A - 1) * cw + sq), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - sq)]
        a = [(A + 1) - (A - 1) * cw + sq, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - sq]
    elif kind == "bandpass":  # constant 0 dB peak gain
        b = [alpha, 0.0, -alpha]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    else:
        raise ValueError(kind)
    b = np.array(b) / a[0]
    a = np.array(a) / a[0]
    return b, a


def eq_peak(x, f0: float, gain_db: float, q: float = 1.0, sr: int = SR):
    b, a = _rbj("peak", f0, gain_db, q, sr)
    return signal.lfilter(b, a, x, axis=0).astype(F32)


def eq_shelf(x, f0: float, gain_db: float, kind: str = "high", q: float = 0.707, sr: int = SR):
    b, a = _rbj("highshelf" if kind == "high" else "lowshelf", f0, gain_db, q, sr)
    return signal.lfilter(b, a, x, axis=0).astype(F32)


def resonator(x, f0: float, q: float, sr: int = SR):
    """Two-pole band-pass with unity gain at f0."""
    b, a = _rbj("bandpass", f0, 0.0, q, sr)
    return signal.lfilter(b, a, x, axis=0).astype(F32)


def resonator_bank(x, freqs, qs, gains, sr: int = SR):
    y = np.zeros(len(x), dtype=np.float64)
    for f0, q, g in zip(freqs, qs, gains):
        if f0 < 0.45 * sr:
            y += g * resonator(x, f0, q, sr)
    return y.astype(F32)


def moving_band_noise(n: int, rng, fc_curve, q: float = 4.0, fmin: float = 100.0, fmax: float = 4000.0,
                      per_oct: float = 4.0, sr: int = SR) -> np.ndarray:
    """Noise through a band-pass whose centre follows fc_curve (Hz, length n).

    Implemented as a bank of fixed band-passed independent noises that are
    cross-faded with Gaussian weights in log-frequency, so it stays vectorised.
    """
    fc_curve = np.clip(np.asarray(fc_curve, dtype=np.float32), fmin, fmax)
    nb = max(3, int(np.ceil(np.log2(fmax / fmin) * per_oct)) + 1)
    centers = fmin * (fmax / fmin) ** (np.arange(nb) / (nb - 1))
    lf = np.log2(fc_curve)
    sigma = max(0.5 / per_oct, 0.6 / q)  # octaves
    out = np.zeros(n, dtype=np.float32)
    wsum = np.zeros(n, dtype=np.float32)
    bw_oct = max(1.0 / per_oct, 1.0 / q)
    for c in centers:
        w = np.exp(-0.5 * ((lf - np.log2(c)) / sigma) ** 2).astype(np.float32)
        if float(w.max()) < 1e-3:
            continue
        lo, hi = c * 2 ** (-bw_oct / 2), c * 2 ** (bw_oct / 2)
        b = bp(white(n, rng), lo, hi, 1, sr)
        b /= (np.sqrt(np.mean(b * b)) + 1e-9)
        out += w * b
        wsum += w * w
    out /= np.sqrt(np.maximum(wsum, 1e-6))
    return out


# -------------------------------------------------------- modal / impacts ---

def modal(freqs, taus, amps, dur: float, sr: int = SR, phases=None) -> np.ndarray:
    """Sum of exponentially damped sinusoids (sine phase => click-free onset)."""
    n = n_of(dur, sr)
    t = np.arange(n) / sr
    y = np.zeros(n, dtype=np.float64)
    for i, (f0, tau, a) in enumerate(zip(freqs, taus, amps)):
        if f0 >= 0.45 * sr or f0 <= 0:
            continue
        ph = 0.0 if phases is None else phases[i]
        y += a * np.exp(-t / tau) * np.sin(TAU * f0 * t + ph)
    return y.astype(F32)


def noise_burst(rng, dur: float, lo: float, hi: float, tau: float, attack: float = 0.0005, sr: int = SR) -> np.ndarray:
    """Band-limited noise burst with exponential decay."""
    n = n_of(dur, sr)
    x = white(n + 64, rng)
    if lo and lo > 20:
        x = bp(x, lo, hi, 2, sr) if hi and hi < 0.45 * sr else hp(x, lo, 2, sr)
    elif hi:
        x = lp(x, hi, 2, sr)
    x = x[64:]
    e = exp_decay(n, tau, sr)
    a = max(1, int(attack * sr))
    e[:a] *= cos_ramp(a)
    y = x * e
    return (y / (np.max(np.abs(y)) + 1e-9)).astype(F32)


def impulses(n: int, rng, density_hz: float, sr: int = SR, sigma: float = 0.6, bipolar: bool = True) -> np.ndarray:
    """Poisson impulse train with log-normal amplitudes."""
    k = int(rng.poisson(max(density_hz, 0.0) * n / sr))
    x = np.zeros(n, dtype=np.float32)
    if k == 0:
        return x
    idx = rng.integers(0, n, k)
    amp = rng.lognormal(0.0, sigma, k).astype(np.float32)
    if bipolar:
        amp *= rng.choice(np.array([-1.0, 1.0], dtype=np.float32), k)
    np.add.at(x, idx, amp)
    return x


def conv_same(x, k) -> np.ndarray:
    """Causal convolution truncated to len(x)."""
    if len(x) > 8 * len(k) and len(k) > 64:
        y = signal.oaconvolve(x, k)
    else:
        y = signal.fftconvolve(x, k)
    return y[:len(x)].astype(F32)


def place(buf, x, start: int, gain: float = 1.0):
    """Mix x into buf at sample offset (clipped to the buffer). In place."""
    if x is None or len(x) == 0:
        return
    s = int(start)
    xs = 0
    if s < 0:
        xs = -s
        s = 0
    e = min(len(buf), s + len(x) - xs)
    if e <= s:
        return
    seg = x[xs:xs + (e - s)]
    if buf.ndim == 2 and seg.ndim == 1:
        buf[s:e, 0] += gain * seg
        buf[s:e, 1] += gain * seg
    elif buf.ndim == 1 and seg.ndim == 2:
        buf[s:e] += gain * seg.mean(axis=1)
    else:
        buf[s:e] += gain * seg


# -------------------------------------------------- source-filter voices ---

def formant_env(freq, F, B, G, floor: float = 0.0):
    """Spectral envelope made of resonance peaks, sampled at `freq`.

    freq: array; F/B/G: sequences of scalars or arrays broadcastable to freq.
    """
    g = np.full(np.shape(freq), floor, dtype=np.float64)
    for f_i, b_i, g_i in zip(F, B, G):
        g = g + g_i / np.sqrt(1.0 + ((freq - f_i) / (0.5 * b_i)) ** 2)
    return g


def harmonic_voice(f0, amp, formants=None, tilt_db_oct: float = -9.0, fmax: float = 10000.0,
                   sub: float = 0.0, rand_phase=None, sr: int = SR, hgains=None) -> np.ndarray:
    """Alias-free additive voiced source through a (time-varying) formant envelope.

    f0, amp: per-sample arrays. formants = (F, B, G). `sub` adds sub-harmonics at
    (k - 1/2) f0 for the rough, period-doubled quality of barks and squawks.
    """
    f0 = np.asarray(f0, dtype=np.float64)
    n = len(f0)
    phase = TAU * np.cumsum(f0) / sr
    fmax = min(fmax, 0.45 * sr)
    kmax = max(1, int(fmax / max(float(f0.min()), 20.0)))
    out = np.zeros(n, dtype=np.float64)
    roll = 0.12 * fmax

    def partial(mult, gain, ph):
        fk = mult * f0
        g = gain * (mult ** (tilt_db_oct / 6.0206))
        if formants is not None:
            g = g * formant_env(fk, *formants)
        g = g * np.clip((fmax - fk) / roll, 0.0, 1.0)
        return g * np.sin(mult * phase + ph)

    for k in range(1, kmax + 1):
        ph = 0.0 if rand_phase is None else rand_phase.uniform(0, TAU)
        hg = 1.0 if hgains is None else (hgains[k - 1] if k - 1 < len(hgains) else 0.0)
        if hg == 0.0:
            continue
        out += partial(float(k), hg, ph)
        if sub > 0.0:
            out += partial(k - 0.5, sub, 0.7 * k)
    return (out * np.asarray(amp, dtype=np.float64)).astype(F32)


def stft_shape(x, gain_fn, nfft: int = 1024, sr: int = SR) -> np.ndarray:
    """Zero-phase time-varying spectral shaping (75% overlap, sqrt-Hann).

    gain_fn(times[T], freqs[F]) -> gains[T, F].
    """
    hop = nfft // 4
    n = len(x)
    pad = nfft
    total = n + 2 * pad
    nfr = int(np.ceil((total - nfft) / hop)) + 1
    total = (nfr - 1) * hop + nfft
    xp = np.zeros(total, dtype=np.float64)
    xp[pad:pad + n] = x
    win = np.sqrt(signal.get_window("hann", nfft, fftbins=True))
    frames = np.lib.stride_tricks.sliding_window_view(xp, nfft)[::hop]
    X = sfft.rfft(frames * win, axis=1)
    tc = (np.arange(len(frames)) * hop + nfft / 2 - pad) / sr
    fr = sfft.rfftfreq(nfft, 1.0 / sr)
    X *= gain_fn(tc, fr)
    yf = sfft.irfft(X, nfft, axis=1) * win
    y = np.zeros(total, dtype=np.float64)
    for i in range(len(yf)):
        y[i * hop:i * hop + nfft] += yf[i]
    y /= 2.0  # sum of win^2 at 75% overlap
    return y[pad:pad + n].astype(F32)


def formant_noise(n: int, rng, F, B, G, tilt_db_oct: float = 0.0, lo: float = 150.0, hi: float = 11000.0,
                  sr: int = SR) -> np.ndarray:
    """Noise through a (time-varying) formant envelope. F/B/G scalars or per-sample arrays."""
    x = rng.standard_normal(n)
    idx_max = n - 1

    def at(v, ti):
        if np.ndim(v) == 0:
            return float(v)
        return np.asarray(v)[ti][:, None]

    def gain(tc, fr):
        ti = np.clip((tc * sr).astype(int), 0, idx_max)
        f2 = fr[None, :]
        g = np.zeros((len(tc), len(fr)))
        for f_i, b_i, g_i in zip(F, B, G):
            g = g + at(g_i, ti) / np.sqrt(1.0 + ((f2 - at(f_i, ti)) / (0.5 * at(b_i, ti))) ** 2)
        g = g * mag_slope(f2, tilt_db_oct) * mag_band(f2, lo, hi, 2)
        return g

    y = stft_shape(x, gain, nfft=512, sr=sr)
    return (y / (np.sqrt(np.mean(y * y)) + 1e-9)).astype(F32)


def tone(f, amp=1.0, sr: int = SR, phase0: float = 0.0) -> np.ndarray:
    """Sine with per-sample frequency array (phase-continuous)."""
    f = np.asarray(f, dtype=np.float64)
    return (np.sin(TAU * np.cumsum(f) / sr + phase0) * amp).astype(F32)


# ---------------------------------------------------------------- stereo ---

def to_stereo(x) -> np.ndarray:
    x = np.asarray(x, dtype=F32)
    if x.ndim == 2:
        return x
    return np.repeat(x[:, None], 2, axis=1)


def pan_gains(p: float):
    """Constant-power pan law; p in -1..1."""
    th = (float(np.clip(p, -1.0, 1.0)) + 1.0) * np.pi / 4.0
    return float(np.cos(th)), float(np.sin(th))


def pan(x, p: float) -> np.ndarray:
    """Mono -> stereo constant-power pan; stereo -> balance (centre = unity)."""
    x = np.asarray(x, dtype=F32)
    gl, gr = pan_gains(p)
    if x.ndim == 1:
        return np.stack([x * gl, x * gr], axis=1).astype(F32)
    s2 = np.sqrt(2.0)
    return np.stack([x[:, 0] * min(1.0, gl * s2), x[:, 1] * min(1.0, gr * s2)], axis=1).astype(F32)


def pan_curve(x, p) -> np.ndarray:
    """Mono -> stereo with a per-sample pan curve."""
    th = (np.clip(np.asarray(p, dtype=np.float32), -1.0, 1.0) + 1.0) * (np.pi / 4.0)
    return np.stack([x * np.cos(th), x * np.sin(th)], axis=1).astype(F32)


def width(x, w: float) -> np.ndarray:
    """Mid/side width control on a stereo signal (w=1 unchanged)."""
    m = 0.5 * (x[:, 0] + x[:, 1])
    s = 0.5 * (x[:, 0] - x[:, 1]) * w
    return np.stack([m + s, m - s], axis=1).astype(F32)


# ---------------------------------------------------------------- reverb ---

IR_SPECS = {
    # rt60 low / mid / high (s), length (s), predelay (ms), early level, early span (ms), darkness (lp Hz)
    "room":    dict(rt=(0.36, 0.30, 0.20), length=0.50, pre=2.0, early=0.9, span=22.0, lp=9000.0, echoes=()),
    "hallway": dict(rt=(1.00, 0.85, 0.50), length=1.30, pre=6.0, early=0.8, span=45.0, lp=7000.0, echoes=()),
    "street":  dict(rt=(1.60, 1.30, 0.70), length=2.20, pre=12.0, early=0.6, span=70.0, lp=6000.0,
                    echoes=((0.115, 0.55, -0.5), (0.205, 0.38, 0.6), (0.340, 0.24, -0.2), (0.520, 0.13, 0.4))),
    "forest":  dict(rt=(1.00, 0.80, 0.38), length=1.40, pre=15.0, early=0.5, span=90.0, lp=5500.0,
                    echoes=((0.160, 0.20, 0.5), (0.290, 0.12, -0.6))),
    "open":    dict(rt=(2.40, 1.90, 0.80), length=3.20, pre=30.0, early=0.3, span=120.0, lp=4200.0,
                    echoes=((0.330, 0.42, -0.6), (0.610, 0.26, 0.5), (0.950, 0.14, -0.2))),
    "ruin":    dict(rt=(2.70, 2.20, 1.10), length=3.20, pre=14.0, early=0.7, span=80.0, lp=5200.0, echoes=()),
    "hall":    dict(rt=(3.00, 2.60, 1.25), length=3.40, pre=24.0, early=0.5, span=85.0, lp=7500.0, echoes=()),
    "boom":    dict(rt=(4.20, 3.00, 1.00), length=4.60, pre=10.0, early=0.4, span=90.0, lp=1400.0, echoes=()),
}


@functools.lru_cache(maxsize=32)
def make_ir(kind: str, sr: int = SR) -> np.ndarray:
    """Synthetic stereo impulse response: sparse early reflections + a dense
    noise tail whose decay time falls with frequency. Unit energy per channel."""
    spec = IR_SPECS[kind]
    rng = make_rng("ir", kind)
    n = n_of(spec["length"], sr)
    t = np.arange(n) / sr
    rt_lo, rt_mid, rt_hi = spec["rt"]
    bands = [(0.0, 250.0, rt_lo), (250.0, 900.0, 0.5 * (rt_lo + rt_mid)), (900.0, 2800.0, rt_mid),
             (2800.0, 6500.0, rt_hi), (6500.0, 16000.0, 0.55 * rt_hi)]
    tail = np.zeros((n, 2), dtype=np.float64)
    shared = rng.standard_normal(n)
    for ch in range(2):
        own = rng.standard_normal(n)
        for i, (lo, hi, rt) in enumerate(bands):
            src = shared if i == 0 else own  # keep the low end mono-compatible
            if lo <= 0:
                sos = signal.butter(2, hi, btype="low", fs=sr, output="sos")
            else:
                sos = signal.butter(2, [lo, min(hi, 0.45 * sr)], btype="band", fs=sr, output="sos")
            b = signal.sosfiltfilt(sos, src)
            tail[:, ch] += b * np.exp(-6.908 * t / rt)
    build = 1.0 - np.exp(-t / 0.012)  # diffuse build-up instead of a click
    tail *= build[:, None]
    tail /= np.sqrt(np.sum(tail ** 2, axis=0, keepdims=True)) + 1e-12

    early = np.zeros((n, 2), dtype=np.float64)
    span = spec["span"] / 1000.0
    k = 14
    for _ in range(k):
        dt = rng.uniform(0.004, span)
        g = spec["early"] * 0.5 / (1.0 + dt / 0.012) * rng.choice([-1.0, 1.0])
        p = rng.uniform(-0.9, 0.9)
        gl, gr = pan_gains(p)
        i = int(dt * sr)
        if i < n:
            early[i, 0] += g * gl
            early[i, 1] += g * gr
    for dt, g, p in spec["echoes"]:
        gl, gr = pan_gains(p)
        i = int(dt * sr)
        m = n_of(0.012, sr)  # slightly smeared slap echo
        if i + m < n:
            blur = np.hanning(m) * rng.standard_normal(m)
            blur /= np.sqrt(np.sum(blur ** 2)) + 1e-12
            early[i:i + m, 0] += g * gl * blur
            early[i:i + m, 1] += g * gr * blur
    ir = tail + early
    ir = signal.sosfilt(signal.butter(2, spec["lp"], btype="low", fs=sr, output="sos"), ir, axis=0)
    pre = int(spec["pre"] / 1000.0 * sr)
    if pre > 0:
        ir = np.concatenate([np.zeros((pre, 2)), ir])[:n]
    ir *= fade(np.ones(n), 0.0, 0.08, sr)[:, None]
    ir /= np.sqrt(np.sum(ir ** 2, axis=0, keepdims=True)) + 1e-12
    return ir.astype(F32)


def convolve_ir(x, ir) -> np.ndarray:
    """x mono or stereo, ir (m, 2) -> stereo, full length (tail kept)."""
    x = np.asarray(x, dtype=F32)
    conv = signal.oaconvolve if len(x) > 6 * len(ir) else signal.fftconvolve
    if x.ndim == 1:
        return np.stack([conv(x, ir[:, 0]), conv(x, ir[:, 1])], axis=1).astype(F32)
    return np.stack([conv(x[:, 0], ir[:, 0]), conv(x[:, 1], ir[:, 1])], axis=1).astype(F32)


def reverb(x, kind: str = "room", wet: float = 0.25, dry: float = 1.0, tail: bool = True) -> np.ndarray:
    """Stereo reverb. Returns len(x)+len(ir)-1 samples when tail=True."""
    ir = make_ir(kind)
    w = convolve_ir(x, ir)
    out = wet * w
    xs = to_stereo(x)
    out[:len(xs)] += dry * xs
    if not tail:
        out = out[:len(xs)]
    return trim_tail(out)


def trim_tail(x, thresh_db: float = -72.0, keep: float = 0.03, sr: int = SR) -> np.ndarray:
    """Drop the inaudible end of a decaying tail and fade the cut."""
    a = np.abs(x).max(axis=1) if x.ndim == 2 else np.abs(x)
    pk = float(a.max()) if len(a) else 0.0
    if pk <= 0:
        return x
    idx = np.nonzero(a > pk * 10 ** (thresh_db / 20.0))[0]
    end = min(len(x), int(idx[-1]) + int(keep * sr)) if len(idx) else len(x)
    return fade(x[:end], 0.0, min(0.03, end / sr / 4))


SPACE_WET = {"street": (0.10, 0.60), "hallway": (0.18, 0.60), "forest": (0.08, 0.50), "room": (0.10, 0.32),
             "open": (0.05, 0.50), "ruin": (0.15, 0.55), "hall": (0.15, 0.55)}


def distance_fx(x, dist: float, space: str = "street") -> np.ndarray:
    """Push a source away: air absorption + more of the space. Returns stereo.

    Level is NOT reduced here; the registry normalises afterwards so that the
    cue's gain_db alone sets loudness.
    """
    d = float(np.clip(dist, 0.0, 1.0))
    y = np.asarray(x, dtype=F32)
    if d > 0.02:
        y = lp(y, 16000.0 * (0.12 ** d), 1)
        if d > 0.4:
            y = lp(y, 16000.0 * (0.2 ** d), 1)
    w0, w1 = SPACE_WET.get(space, (0.1, 0.5))
    wet = w0 + (w1 - w0) * d
    return reverb(y, space if space in IR_SPECS else "street", wet=wet, dry=1.0 - 0.45 * d)


# --------------------------------------------------------------- utility ---

def norm_peak(x, peak: float = 1.0) -> np.ndarray:
    m = float(np.max(np.abs(x))) if len(x) else 0.0
    return (x * (peak / m)).astype(F32) if m > 0 else np.asarray(x, dtype=F32)


def db(x: float) -> float:
    return 20.0 * np.log10(max(float(x), 1e-12))


def undb(d: float) -> float:
    return float(10.0 ** (d / 20.0))


def soft_clip(x, drive: float = 1.0) -> np.ndarray:
    return (np.tanh(x * drive) / np.tanh(drive)).astype(F32)


def resample_to(x, sr_in: int, sr_out: int = SR) -> np.ndarray:
    if sr_in == sr_out:
        return np.asarray(x, dtype=F32)
    g = np.gcd(int(sr_in), int(sr_out))
    return signal.resample_poly(x, sr_out // g, sr_in // g, axis=0).astype(F32)


def sequence(events, tail: float = 0.0, sr: int = SR, stereo: bool = False) -> np.ndarray:
    """Mix a list of (time_s, array[, gain]) into one buffer."""
    end = 0
    for ev in events:
        end = max(end, int(ev[0] * sr) + len(ev[1]))
    n = end + int(tail * sr)
    any_st = stereo or any(ev[1].ndim == 2 for ev in events)
    buf = np.zeros((n, 2) if any_st else n, dtype=F32)
    for ev in events:
        place(buf, ev[1], int(ev[0] * sr), ev[2] if len(ev) > 2 else 1.0)
    return buf
