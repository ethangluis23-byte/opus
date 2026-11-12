"""Cue vocabulary: maps timeline `type` names to generators and gives every
sound a common nominal level so a cue's gain_db means the same thing everywhere.

Level contract (on the pre-master mix bus, narration sits at REF_LUFS):
  one-shot at gain_db 0 -> its loudest 125 ms is as loud as the narrator's
                           loud syllables, peaks no higher than the narrator's;
  bed at gain_db 0      -> integrated loudness equal to the narrator's.
So 0 dB = clearly foreground, -12 = present, -24 = subtle background.
"""
from __future__ import annotations

import json
import os

import numpy as np

from . import beds, sfx_animals, sfx_cinematic, sfx_foley
from .cache import DiskCache, make_key, source_hash
from .dsp import SR, F32, db, undb, to_stereo, stable_seed
from .dynamics import integrated_lufs, max_window_level

REF_LUFS = -18.0                    # narration bus loudness before mastering
ONESHOT_NOMINAL = REF_LUFS + 5.0    # loudest 125 ms window of a one-shot at 0 dB
PEAK_CEIL_DB = REF_LUFS + 14.0      # sample-peak ceiling of a one-shot at 0 dB
BED_NOMINAL = REF_LUFS              # integrated loudness of a bed at 0 dB
BED_QUANT = 5.0                     # beds are rendered in 5 s steps so small retimes reuse the cache
CAL_SECONDS = 60.0

ONESHOTS = {}
ONESHOTS.update(sfx_animals.GENERATORS)
ONESHOTS.update(sfx_foley.GENERATORS)
ONESHOTS.update(sfx_cinematic.GENERATORS)
BEDS = dict(beds.GENERATORS)
PREROLL = dict(sfx_cinematic.PREROLL)

# Perceptual trims on top of the measured nominal (dB).
ONESHOT_TRIM = {"ui_pop": -3.0, "mouse_squeak": -2.0, "cat_hiss": -2.0, "parrot_squawk": -1.5, "glass_break": -2.0}

_CODE_FILES = ("dsp.py", "dynamics.py", "beds.py", "sfx_animals.py", "sfx_foley.py", "sfx_cinematic.py", "registry.py")
_code_hash = None


def code_hash() -> str:
    global _code_hash
    if _code_hash is None:
        _code_hash = source_hash(*_CODE_FILES)
    return _code_hash


def _public(params) -> dict:
    return {k: v for k, v in (params or {}).items() if not str(k).startswith("_")}


def _clean(x) -> np.ndarray:
    x = np.nan_to_num(np.asarray(x, dtype=F32), nan=0.0, posinf=0.0, neginf=0.0)
    if x.ndim == 2 and x.shape[1] == 1:
        x = x[:, 0]
    return x


def normalize_oneshot(x, typ: str = "") -> np.ndarray:
    lk, lz = max_window_level(x, 0.125)
    level = max(lk, lz - 4.0)  # sub-heavy sounds are judged by their unweighted level
    g = ONESHOT_NOMINAL + ONESHOT_TRIM.get(typ, 0.0) - level
    pk = db(float(np.max(np.abs(x)))) if len(x) else -120.0
    if x.ndim == 1:
        pk -= 3.01  # a mono source is centre-panned with constant power in the mix
    g = min(g, PEAK_CEIL_DB - pk)
    return (x * undb(g)).astype(F32)


def render_oneshot(typ: str, params, seed: int, cache: DiskCache | None = None, root: str = "."):
    """Returns (audio, preroll_seconds). audio is mono or stereo at nominal level."""
    fn = ONESHOTS[typ]
    p = dict(params or {})
    sig = None
    if typ == "parrot_talk":
        path = p.get("_file") or os.path.join(root, "build", "audio", "parrot", f"{p.get('id', '')}.wav")
        p["_file"] = path
        try:
            st = os.stat(path)
            sig = (os.path.abspath(path), st.st_size, int(st.st_mtime))
        except OSError:
            sig = "missing"
    key = make_key("oneshot", typ, _public(p), seed, sig, code_hash())
    x = cache.load("sfx", typ, key) if cache else None
    if x is None:
        p["_seed"] = seed
        p["_root"] = root
        x = normalize_oneshot(_clean(fn(p, SR)), typ)
        if cache:
            cache.save("sfx", typ, key, x)
    return x, float(PREROLL.get(typ, 0.0))


_cal = None


def _cal_path() -> str:
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "calibration.json")


def bed_calibration(cache: DiskCache | None = None, log=None) -> dict:
    """Per-bed trim (dB) that brings a 60 s default render to BED_NOMINAL.

    Read from audio/calibration.json when it was made with the current code;
    otherwise measured once and kept in the build cache.
    """
    global _cal
    if _cal is not None:
        return _cal
    ch = code_hash()
    candidates = [_cal_path()]
    if cache and cache.enabled:
        candidates.append(os.path.join(cache.root, f"calibration_{ch}.json"))
    for p in candidates:
        try:
            with open(p) as f:
                d = json.load(f)
            if d.get("code_hash") == ch and set(BEDS) <= set(d.get("bed_trim_db", {})):
                _cal = d["bed_trim_db"]
                return _cal
        except (OSError, ValueError):
            continue
    if log:
        log("bed calibration is missing or stale for this code; measuring (one-off, ~1 min)")
    trims = {}
    for typ, fn in BEDS.items():
        x = _clean(fn({"dur": CAL_SECONDS, "_seed": stable_seed("calibration", typ)}, SR))
        trims[typ] = round(BED_NOMINAL - integrated_lufs(x), 2)
    _cal = trims
    if cache and cache.enabled:
        os.makedirs(cache.root, exist_ok=True)
        with open(candidates[-1], "w") as f:
            json.dump({"code_hash": ch, "bed_trim_db": trims}, f, indent=1)
    return _cal


def render_bed(typ: str, dur: float, params, seed: int, cache: DiskCache | None = None, log=None) -> np.ndarray:
    """Stereo bed of at least `dur` seconds at nominal level (trim to length when placing)."""
    fn = BEDS[typ]
    q = float(np.ceil(max(dur, 0.5) / BED_QUANT) * BED_QUANT)
    p = _public(params)
    key = make_key("bed", typ, p, seed, q, code_hash())
    x = cache.load("beds", typ, key) if cache else None
    if x is None:
        trim = bed_calibration(cache, log)[typ]
        p = dict(p)
        p["dur"] = q
        p["_seed"] = seed
        x = to_stereo(_clean(fn(p, SR))) * undb(trim)
        if cache:
            cache.save("beds", typ, key, x)
    return x
