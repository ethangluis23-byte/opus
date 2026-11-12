"""Sanity checks for the meters and dynamics (run manually during development)."""
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from lpaudio import dsp, dynamics as dyn  # noqa: E402

SR = dsp.SR


def main():
    rng = dsp.make_rng("selftest")
    # --- loudness meter vs pyloudnorm
    import pyloudnorm as pyln
    x = np.stack([dsp.pink(SR * 20, rng), dsp.pink(SR * 20, rng)], axis=1) * 0.05
    x[SR * 8:SR * 12] *= 0.02
    mine = dyn.integrated_lufs(x)
    ref = pyln.Meter(SR).integrated_loudness(x.astype(np.float64))
    print(f"integrated LUFS mine {mine:.3f} pyloudnorm {ref:.3f}")
    assert abs(mine - ref) < 0.1
    # 1 kHz sine at -20 dBFS stereo should read about -17 LUFS (two channels) / mono -20
    t = np.arange(SR * 5) / SR
    s = 0.1 * np.sin(2 * np.pi * 997 * t)
    print("997 Hz -20 dBFS mono:", round(dyn.integrated_lufs(s), 2), "max-window:", dyn.max_window_level(s))

    # --- true peak of an inter-sample-peaking signal
    y = np.zeros(4800)
    y[2400:2404] = [0.9, -0.9, 0.9, -0.9]
    print("sample peak dB", round(dsp.db(np.abs(y).max()), 2), "true peak dB", round(dyn.true_peak_db(y), 2))

    # --- limiter: hold window + ceiling
    z = dsp.white(SR * 4, rng) * 0.2
    z[SR * 2] = 3.0
    z[SR * 3:SR * 3 + 2000] *= 6.0
    z = np.stack([z, z * 0.7], axis=1)
    t0 = time.time()
    g = dyn.limiter_gain(z, ceiling_db=-1.2)
    out = z * g[:, None]
    print(f"limiter {time.time() - t0:.2f}s  in TP {dyn.true_peak_db(z):.2f}  out TP {dyn.true_peak_db(out):.2f}  min gain dB {dsp.db(g.min()):.2f}")
    assert dyn.true_peak_db(out) <= -1.0
    i = SR * 2
    L = int(0.004 * SR)
    print("gain around isolated peak (dB) at -L, -L/2, 0, +L/2, +L:",
          [round(dsp.db(g[i + k]), 2) for k in (-L, -L // 2, 0, L // 2, L)])

    # --- compressor static behaviour
    lv = np.concatenate([np.full(SR, a) for a in (0.01, 0.05, 0.2, 0.6)]) * np.sin(2 * np.pi * 300 * np.arange(4 * SR) / SR)
    cg = dyn.compressor_gain(lv, thresh_db=-20.0, ratio=3.0)
    print("compressor gain dB per level step:", [round(dsp.db(cg[int((k + 0.9) * SR)]), 2) for k in range(4)])

    # --- reverb IRs
    for k in dsp.IR_SPECS:
        ir = dsp.make_ir(k)
        e = np.cumsum(ir[::-1, 0] ** 2)[::-1]
        edc = 10 * np.log10(e / e[0] + 1e-12)
        t30 = np.argmax(edc < -30) / SR
        print(f"IR {k:8s} len {len(ir) / SR:.2f}s  time to -30 dB {t30:.2f}s  peak {np.abs(ir).max():.3f}")

    # --- stft_shape reconstruction with unity gain
    x = dsp.white(SR, rng)
    y = dsp.stft_shape(x, lambda tc, fr: np.ones((len(tc), len(fr))))
    print("stft_shape unity error dB:", round(dsp.db(np.abs(x - y).max()), 1))

    # --- moving band noise speed
    t0 = time.time()
    fc = 400 * 2 ** (0.8 * dsp.smooth_noise(SR * 60, rng, 0.2))
    w = dsp.moving_band_noise(SR * 60, rng, fc, q=4, fmin=150, fmax=1600)
    print(f"moving_band_noise 60s: {time.time() - t0:.2f}s rms {np.sqrt(np.mean(w ** 2)):.3f}")
    t0 = time.time()
    _ = dsp.shaped_noise(SR * 60, rng, lambda f: dsp.mag_band(f, 200, 2000))
    print(f"shaped_noise 60s: {time.time() - t0:.2f}s")
    print("OK")


if __name__ == "__main__":
    main()
