"""Parrot voice: a bright Kokoro voice made parrot-like (resample-style +5 st, band-limit, rasp, squawk)."""
from __future__ import annotations

import zlib

import numpy as np
from scipy.signal import butter, sosfiltfilt

from ttslib import PEAK_DBFS, SR_K, SR_OUT, fade, resample, speech_bounds

VOICE = "af_heart"
SEMITONES = 5.0
RATIO = 2 ** (SEMITONES / 12)  # plain resample shift: pitch and formants up, playback 1.335x faster
NET_SPEED = 1.1  # audible tempo after the shift
KOKORO_SPEED = round(NET_SPEED / RATIO, 4)  # synthesized slower so the resample lands on NET_SPEED
BAND_HZ = (700.0, 5500.0)
AM_HZ, AM_DEPTH = 80.0, 0.35
DRIVE = 1.8  # tanh saturation
SQUAWK_S, GAP_S = 0.045, 0.012
LEAD_S, TAIL_S = 0.005, 0.020


def _bandpass(x: np.ndarray) -> np.ndarray:
    sos = butter(4, BAND_HZ, btype="bandpass", fs=SR_OUT, output="sos")
    return sosfiltfilt(sos, x)


def squawk(rng: np.random.Generator) -> np.ndarray:
    """Short noisy downward chirp (3.4 kHz -> 1.5 kHz) with a rough amplitude flutter."""
    n = int(SQUAWK_S * SR_OUT)
    t = np.arange(n) / SR_OUT
    f = 3400.0 * (1500.0 / 3400.0) ** (t / SQUAWK_S)
    ph = 2 * np.pi * np.cumsum(f) / SR_OUT
    tone = np.sin(ph) + 0.5 * np.sin(2 * ph) + 0.25 * np.sin(3 * ph)
    noise = rng.standard_normal(n)
    sig = 0.6 * tone / np.abs(tone).max() + 0.55 * noise / np.abs(noise).max()
    sig *= 1 + 0.6 * np.sin(2 * np.pi * 190 * t)
    sig *= np.minimum(1.0, t / 0.004) * np.exp(-t / 0.022)
    return fade(_bandpass(sig), int(0.001 * SR_OUT), int(0.005 * SR_OUT))


def parrotize(x24: np.ndarray, name: str, with_squawk: bool = True) -> np.ndarray:
    """24 kHz Kokoro audio -> 48 kHz parrot line peaking at PEAK_DBFS."""
    rng = np.random.default_rng(zlib.crc32(name.encode()))
    on, off = speech_bounds(x24, SR_K)
    y = resample(x24[on:off + 1], SR_K * RATIO, SR_OUT)
    y = _bandpass(y)
    # Rasp: ~80 Hz amplitude modulation with a slightly wandering rate, then mild saturation.
    t = np.arange(len(y)) / SR_OUT
    knots = max(2, int(t[-1] * 40))
    wander = np.interp(t, np.linspace(0, t[-1], knots), rng.uniform(-1, 1, knots))
    phase = 2 * np.pi * np.cumsum(AM_HZ * (1 + 0.08 * wander)) / SR_OUT
    y = y * (1 + AM_DEPTH * np.sin(phase))
    y = np.tanh(DRIVE * y / np.abs(y).max()) / np.tanh(DRIVE)
    y = _bandpass(y)  # saturation products outside the band are removed again
    y = fade(y, int(0.003 * SR_OUT), int(0.010 * SR_OUT))
    parts = [np.zeros(int(LEAD_S * SR_OUT))]
    if with_squawk:
        sq = squawk(rng)
        parts += [0.8 * np.abs(y).max() * sq / np.abs(sq).max(), np.zeros(int(GAP_S * SR_OUT))]
    parts += [y, np.zeros(int(TAIL_S * SR_OUT))]
    out = np.concatenate(parts)
    return out * 10 ** (PEAK_DBFS / 20) / np.abs(out).max()
