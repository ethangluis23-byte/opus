"""Shared helpers for the narration pipeline (entry point and usage: audio/tts/narrate.py)."""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
# Model downloads (Kokoro, voices, whisper) live inside the virtualenv directory, not in $HOME.
os.environ.setdefault("HF_HOME", str(ROOT / ".venv-tts" / "hf"))

SCRIPT = ROOT / "film" / "script.json"
OVERRIDES = Path(__file__).resolve().parent / "overrides.json"
BUILD = ROOT / "build" / "audio"
TMP = BUILD / "tts_tmp"
CACHE = TMP / "cache"
PRE = TMP / "pre"
NARR_DIR = BUILD / "narration"
PARROT_DIR = BUILD / "parrot"
NARR_JSON = BUILD / "narration.json"
REPORT = BUILD / "tts_report.md"

KOKORO_REPO = "hexgrad/Kokoro-82M"
SR_K = 24000  # Kokoro's native rate
SR_OUT = 48000
PAD_S = 0.020  # leading/trailing silence kept in every line file
TRIM_DB = -50.0  # speech onset/offset: 5 ms RMS relative to the line's sample peak
PAUSE_DB = -45.0  # internal pause detection: 10 ms RMS relative to the line's sample peak
PEAK_DBFS = -3.0
ELLIPSIS_MIN, ELLIPSIS_MAX = 0.30, 0.70  # splice only outside this band (acoustic pause, seconds)
ELLIPSIS_TARGET, ELLIPSIS_TARGET_LONG = 0.45, 0.60
SPEED_MIN, SPEED_MAX = 0.80, 1.10

PUNCT_PH = set(';:,.!?—…"()“”')


# ----------------------------------------------------------------------------- script

@dataclass
class Line:
    id: str
    scene: object
    text: str  # display text; narration.json words follow text.split()
    spoken: str  # what the narrator says (tts override or text)
    synth: str  # what is sent to Kokoro (spoken, or a punctuation/phoneme-hint override)
    speed: float


def _wording(s: str) -> list[str]:
    s = re.sub(r"\[([^\]]+)\]\(/[^)]*/\)", r"\1", s)  # [word](/phonemes/) -> word
    return [w for w in (re.sub(r"[^a-z0-9']", "", t.lower()) for t in s.split()) if w]


def load_script() -> tuple[list[Line], list[tuple[str, str]], dict]:
    data = json.loads(SCRIPT.read_text(encoding="utf-8"))
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8")) if OVERRIDES.exists() else {}
    lines = []
    for ln in data["lines"]:
        lid, text = str(ln["id"]), ln["text"]
        spoken = ln.get("tts") or text
        if len(spoken.split()) != len(text.split()):
            raise ValueError(f"line {lid}: tts override must keep the number of whitespace words")
        synth = overrides.get(lid, {}).get("synth", spoken)
        # Overrides may change punctuation or add phoneme hints, never the wording.
        if _wording(synth) != _wording(spoken) or len(synth.split()) != len(spoken.split()):
            raise ValueError(f"line {lid}: override changes the wording")
        lines.append(Line(lid, ln.get("scene"), text, spoken, synth, float(ln.get("speed", 1.0))))
    parrot = [(str(p["id"]), p["text"]) for p in data.get("parrot", [])]
    return lines, parrot, data.get("meta", {})


def lang_for(voice: str) -> str:
    """'b' only for pure British voices; American voices and blends use 'a'."""
    return "b" if all(p.strip().startswith("b") for p in voice.split(",")) else "a"


def clamp_speed(v: float) -> float:
    return round(min(SPEED_MAX, max(SPEED_MIN, v)), 4)


# ----------------------------------------------------------------------------- Kokoro

@dataclass
class Synth:
    audio: np.ndarray  # float32, 24 kHz, untrimmed
    tokens: list[dict]  # {"t": text, "ws": bool, "ph": phonemes, "s": start, "e": end} (seconds, may be None)
    phonemes: str
    chunks: int
    key: str


class Engine:
    """Kokoro-82M via the official KPipeline, with an on-disk cache keyed by (voice, speed, text)."""

    def __init__(self):
        import torch

        torch.set_num_threads(2)
        self._model = None
        self._pipes = {}

    @property
    def version(self) -> str:
        import kokoro

        return kokoro.__version__

    def _pipe(self, lang: str):
        from kokoro import KModel, KPipeline

        if self._model is None:
            self._model = KModel(repo_id=KOKORO_REPO).to("cpu").eval()
        if lang not in self._pipes:
            self._pipes[lang] = KPipeline(lang_code=lang, repo_id=KOKORO_REPO, model=self._model)
        return self._pipes[lang]

    def synth(self, text: str, voice: str, speed: float, use_cache: bool = True) -> Synth:
        import torch
        from kokoro import KPipeline

        lang = lang_for(voice)
        key = hashlib.sha1(json.dumps([self.version, voice, lang, f"{speed:.4f}", text]).encode()).hexdigest()[:20]
        f = CACHE / f"{key}.npz"
        if use_cache and f.exists():
            z = np.load(f, allow_pickle=False)
            meta = json.loads(str(z["meta"]))
            return Synth(z["audio"], meta["tokens"], meta["phonemes"], meta["chunks"], key)

        pipe = self._pipe(lang)
        vocab = pipe.model.vocab
        torch.manual_seed(int(key[:8], 16))  # decoder noise is random; durations are not
        chunks, tokens, phonemes, offset = [], [], [], 0.0
        for r in pipe(text, voice=voice, speed=speed, split_pattern=None):
            audio = r.output.audio.numpy().astype(np.float32)
            toks = r.tokens or []
            # The model silently drops out-of-vocabulary symbols, which would shift Kokoro's timestamps.
            if any(c not in vocab for t in toks for c in (t.phonemes or "")):
                for t in toks:
                    t.phonemes = "".join(c for c in (t.phonemes or "") if c in vocab)
                    t.start_ts = t.end_ts = None
                KPipeline.join_timestamps(toks, r.output.pred_dur)
            for t in toks:
                tokens.append({
                    "t": t.text, "ws": bool(t.whitespace), "ph": t.phonemes or "",
                    "s": None if t.start_ts is None else float(t.start_ts) + offset,
                    "e": None if t.end_ts is None else float(t.end_ts) + offset,
                })
            chunks.append(audio)
            phonemes.append(r.phonemes)
            offset += len(audio) / SR_K
        if not chunks:
            raise RuntimeError(f"Kokoro produced no audio for: {text!r}")
        audio = np.concatenate(chunks)
        CACHE.mkdir(parents=True, exist_ok=True)
        meta = {"tokens": tokens, "phonemes": " ".join(phonemes), "chunks": len(chunks)}
        np.savez(f, audio=audio, meta=np.array(json.dumps(meta)))
        return Synth(audio, tokens, meta["phonemes"], len(chunks), key)


# ----------------------------------------------------------------------------- signal helpers

def moving_rms(x: np.ndarray, win: int) -> np.ndarray:
    """Centered moving RMS, same length as x."""
    c = np.cumsum(np.concatenate([[0.0], np.asarray(x, dtype=np.float64) ** 2]))
    i = np.arange(len(x))
    lo, hi = np.clip(i - win // 2, 0, len(x)), np.clip(i + win // 2 + 1, 0, len(x))
    return np.sqrt((c[hi] - c[lo]) / (hi - lo))


def speech_bounds(x: np.ndarray, sr: int, db: float = TRIM_DB) -> tuple[int, int]:
    """First and last sample index whose 5 ms RMS exceeds `db` relative to the sample peak."""
    env = moving_rms(x, int(0.005 * sr))
    idx = np.nonzero(env > np.abs(x).max() * 10 ** (db / 20))[0]
    return int(idx[0]), int(idx[-1])


def fade(x: np.ndarray, n_in: int, n_out: int) -> np.ndarray:
    x = x.copy()
    if n_in:
        x[:n_in] *= 0.5 - 0.5 * np.cos(np.pi * np.arange(n_in) / n_in)
    if n_out:
        x[-n_out:] *= 0.5 + 0.5 * np.cos(np.pi * (np.arange(n_out) + 1) / n_out)
    return x


def cut_padded(x: np.ndarray, onset: int, offset: int, lead: int, tail: int) -> tuple[np.ndarray, int]:
    """Cut x so that exactly `lead` samples precede `onset` and `tail` follow `offset`. Returns (cut, start index)."""
    start, end = onset - lead, offset + 1 + tail
    seg = x[max(0, start):min(len(x), end)]
    seg = np.concatenate([np.zeros(max(0, -start)), seg, np.zeros(max(0, end - len(x)))])
    return seg, start


def resample(x: np.ndarray, sr_in: float, sr_out: float) -> np.ndarray:
    import soxr

    return soxr.resample(np.asarray(x, dtype=np.float64), sr_in, sr_out, quality="VHQ")


def rubberband_pitch(x: np.ndarray, sr: int, semitones: float) -> np.ndarray:
    """Formant-preserving pitch shift (Rubber Band R3 engine); duration and timing are unchanged."""
    import soundfile as sf

    with tempfile.TemporaryDirectory(dir=TMP) as d:
        a, b = Path(d) / "in.wav", Path(d) / "out.wav"
        sf.write(a, x, sr, subtype="FLOAT")
        subprocess.run(["rubberband", "-q", "--fine", "--formant", "--pitch", f"{semitones:.4f}", str(a), str(b)],
                       check=True, capture_output=True)
        y, sr2 = sf.read(b, dtype="float64")
    if sr2 != sr or len(y) != len(x):
        raise RuntimeError(f"rubberband changed the length: {len(x)} -> {len(y)} samples")
    return y


def write_wav(path: Path, x: np.ndarray, sr: int = SR_OUT) -> None:
    import soundfile as sf

    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(path, x, sr, subtype="PCM_24")


# ----------------------------------------------------------------------------- word timings

def group_words(tokens: list[dict]) -> list[dict]:
    """Merge Kokoro tokens into whitespace words. s/e span the spoken part; trailing punctuation is excluded."""
    groups, cur = [], []
    for t in tokens:
        cur.append(t)
        if t["ws"]:
            groups.append(cur)
            cur = []
    if cur:
        groups.append(cur)
    words = []
    for g in groups:
        spoken = [t for t in g if t["ph"] and not set(t["ph"]) <= PUNCT_PH]
        ok = bool(spoken) and spoken[0]["s"] is not None and spoken[-1]["e"] is not None
        words.append({
            "text": "".join(t["t"] for t in g),
            "s": spoken[0]["s"] if ok else None,
            "e": spoken[-1]["e"] if ok else None,
            "punct": bool(spoken) and g[-1] is not spoken[-1],  # followed by pause punctuation
        })
    return words


def interpolate_missing(words: list[dict], total: float) -> int:
    """Fill words Kokoro gave no timestamp for, spreading them between their neighbours by length."""
    n, i, filled = len(words), 0, 0
    while i < n:
        if words[i]["s"] is not None:
            i += 1
            continue
        j = i
        while j < n and words[j]["s"] is None:
            j += 1
        left = words[i - 1]["e"] if i else 0.0
        right = words[j]["s"] if j < n else total
        weights = np.array([max(1, len(words[k]["text"])) for k in range(i, j)], dtype=float)
        edges = left + (right - left) * np.concatenate([[0.0], np.cumsum(weights) / weights.sum()])
        for k in range(i, j):
            words[k]["s"], words[k]["e"] = float(edges[k - i]), float(edges[k - i + 1])
        filled += j - i
        i = j
    return filled


def quiet_run(env: np.ndarray, thr: float, lo: int, hi: int) -> tuple[int, tuple[int, int] | None]:
    """Quietest sample in [lo, hi) and the contiguous below-threshold run around it (or None)."""
    lo = min(max(0, lo), len(env) - 1)
    hi = min(len(env), max(hi, lo + 1))
    seed = lo + int(np.argmin(env[lo:hi]))
    if env[seed] >= thr:
        return seed, None
    loud = np.nonzero(env >= thr)[0]
    k = int(np.searchsorted(loud, seed))
    a = int(loud[k - 1]) + 1 if k > 0 else 0
    b = int(loud[k]) if k < len(loud) else len(env)
    return seed, (a, b)


def snap_pauses(words: list[dict], x: np.ndarray, sr: int) -> dict[int, dict]:
    """Kokoro's token boundaries around punctuation include the silence. Where a clear acoustic pause
    exists, move the word end / next word start onto its edges. Returns the pause found after each
    punctuated word: {index: {"a": start, "b": end, "run": bool}} in seconds."""
    env = moving_rms(x, int(0.010 * sr))
    thr = np.abs(x).max() * 10 ** (PAUSE_DB / 20)
    pauses = {}
    for i in range(len(words) - 1):
        w, nx = words[i], words[i + 1]
        if not w["punct"]:
            continue
        p0, p1 = w["e"], nx["s"]  # Kokoro's punctuation span
        seed, run = quiet_run(env, thr, int((p0 - 0.02) * sr), int((p1 + 0.02) * sr))
        if run is None:
            pauses[i] = {"a": seed / sr, "b": seed / sr, "run": False}
            continue
        a, b = run[0] / sr, run[1] / sr
        pauses[i] = {"a": a, "b": b, "run": True}
        if b - a >= 0.10:  # longer than a stop closure
            if w["s"] + 0.05 <= a <= p0 + 0.05:
                w["e"] = a
            if -0.10 <= b - p1 <= 0.12 and b < nx["e"] - 0.03:
                nx["s"] = b
    return pauses


def is_ellipsis(token: str) -> bool:
    return token.rstrip("\"')”’").endswith(("...", "…"))


def fix_ellipses(x: np.ndarray, words: list[dict], spoken_tokens: list[str], pauses: dict[int, dict],
                 sr: int) -> tuple[np.ndarray, list[dict]]:
    """Bring the pause after each mid-line ellipsis into range by splicing silence at the word boundary
    (or removing some); later word times are shifted. Returns (audio, per-ellipsis report)."""
    report = []
    for i in reversed(range(len(words) - 1)):
        if not is_ellipsis(spoken_tokens[i]):
            continue
        p = pauses.get(i)
        if p is None:  # no punctuation token after the word: treat the Kokoro boundary as a zero-length pause
            p = {"a": words[i]["e"], "b": words[i]["e"], "run": False}
        pause = p["b"] - p["a"]
        delta = 0.0
        if pause < ELLIPSIS_MIN:
            delta = ELLIPSIS_TARGET - pause
        elif pause > ELLIPSIS_MAX:
            delta = ELLIPSIS_TARGET_LONG - pause
        n = int(round(delta * sr))
        if n:
            mid = int(round((p["a"] + p["b"]) / 2 * sr))
            nf = int((0.003 if p["run"] else 0.008) * sr)
            if n > 0:
                left, right = x[:mid], x[mid:]
            else:
                left, right = x[:mid - (-n) // 2], x[mid + (-n) - (-n) // 2:]
            left, right = fade(left, 0, min(nf, len(left))), fade(right, min(nf, len(right)), 0)
            x = np.concatenate([left, np.zeros(max(n, 0)), right])
            for w in words[i + 1:]:
                w["s"] += n / sr
                w["e"] += n / sr
        report.append({"word": spoken_tokens[i], "index": i, "acoustic_pause": round(pause, 3),
                       "spliced": round(n / sr, 3), "final_pause": round(pause + n / sr, 3)})
    return x, report[::-1]


def finalize_words(words: list[dict], display: list[str], dur: float) -> list[dict]:
    """Clamp, round to ms, enforce monotonic non-overlapping 0 <= s < e <= dur, attach display tokens."""
    n = len(words)
    s = np.array([w["s"] for w in words], dtype=float)
    e = np.array([w["e"] for w in words], dtype=float)
    s[0] = max(PAD_S, s[0]) if max(PAD_S, s[0]) < e[0] - 0.01 else PAD_S
    e[-1] = min(dur - PAD_S, e[-1]) if min(dur - PAD_S, e[-1]) > s[-1] + 0.01 else dur - PAD_S
    s, e = np.clip(s, 0.0, dur), np.clip(e, 0.0, dur)
    s, e = np.round(s, 3), np.round(e, 3)
    for i in range(n):
        if i and s[i] < e[i - 1]:
            s[i] = e[i - 1]
        if e[i] < s[i] + 0.001:
            e[i] = round(s[i] + 0.001, 3)
    out = [{"w": display[i], "s": float(round(s[i], 3)), "e": float(round(e[i], 3))} for i in range(n)]
    validate_words(out, display, dur)
    return out


def validate_words(words: list[dict], display: list[str], dur: float) -> None:
    assert len(words) == len(display), f"word count {len(words)} != {len(display)}"
    prev = 0.0
    for w, d in zip(words, display):
        assert w["w"] == d, (w, d)
        assert 0.0 <= w["s"] < w["e"] <= dur + 1e-9, (w, dur)
        assert w["s"] >= prev - 1e-9, (w, prev)
        prev = w["e"]


# ----------------------------------------------------------------------------- line processing

@dataclass
class Processed:
    audio: np.ndarray  # 48 kHz float64, trimmed to PAD_S lead/tail, before the global gain
    words: list[dict]
    dur: float
    info: dict


def process_line(syn: Synth, text: str, spoken: str, pitch_st: float = 0.0) -> Processed:
    display = text.split()
    x = syn.audio.astype(np.float64)
    words = group_words(syn.tokens)
    if len(words) != len(display):
        raise RuntimeError(f"token grouping gave {len(words)} words, text has {len(display)}: "
                           f"{[w['text'] for w in words]}")
    interpolated = interpolate_missing(words, len(x) / SR_K)
    kokoro_gap = {i: round(words[i + 1]["s"] - words[i]["e"], 3) for i in range(len(words) - 1) if words[i]["punct"]}
    pauses = snap_pauses(words, x, SR_K)
    x, ellipses = fix_ellipses(x, words, spoken.split(), pauses, SR_K)
    for r in ellipses:
        r["kokoro_punct_gap"] = kokoro_gap.get(r["index"])

    y = resample(x, SR_K, SR_OUT)
    onset, offset = speech_bounds(y, SR_OUT)  # trim points always come from the unshifted signal
    if pitch_st:
        y = rubberband_pitch(y, SR_OUT, pitch_st)
    pad = int(round(PAD_S * SR_OUT))
    z, start = cut_padded(y, onset, offset, pad, pad)
    z = fade(z, pad // 2, pad // 2)
    for w in words:
        w["s"] -= start / SR_OUT
        w["e"] -= start / SR_OUT
    dur = len(z) / SR_OUT
    out = finalize_words(words, display, dur)
    info = {
        "key": syn.key, "chunks": syn.chunks, "phonemes": syn.phonemes, "interpolated_words": interpolated,
        "ellipses": ellipses, "peak": float(np.abs(z).max()), "kokoro_dur": round(len(syn.audio) / SR_K, 4),
        "lead_trimmed": round(start / SR_OUT, 4),
    }
    return Processed(z, out, dur, info)


# ----------------------------------------------------------------------------- ASR check

# Spelling variants / homophones whisper may legitimately choose; both sides are mapped to one form.
HOMOPHONES: dict[str, str] = {}

_normalizer = None


def normalize(text: str) -> list[str]:
    global _normalizer
    if _normalizer is None:
        from whisper_normalizer.english import EnglishTextNormalizer

        _normalizer = EnglishTextNormalizer()
    return [HOMOPHONES.get(w, w) for w in _normalizer(text).split()]


def word_errors(ref_text: str, hyp_text: str) -> tuple[int, list[str]]:
    """Word-level edit distance after normalization (numbers, case, punctuation); compound words that
    are merely split or joined ("stand offs" / "standoffs") count as equal. Returns (errors, diffs)."""
    r, h = normalize(ref_text), normalize(hyp_text)
    n, m = len(r), len(h)
    d = np.zeros((n + 1, m + 1), dtype=int)
    back = {}
    d[:, 0] = np.arange(n + 1)
    d[0, :] = np.arange(m + 1)
    for i in range(1, n + 1):
        back[i, 0] = (i - 1, 0)
    for j in range(1, m + 1):
        back[0, j] = (0, j - 1)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            cands = [
                (d[i - 1, j - 1] + (r[i - 1] != h[j - 1]), (i - 1, j - 1)),
                (d[i - 1, j] + 1, (i - 1, j)),
                (d[i, j - 1] + 1, (i, j - 1)),
            ]
            if i >= 2 and r[i - 2] + r[i - 1] == h[j - 1]:
                cands.append((d[i - 2, j - 1], (i - 2, j - 1)))
            if j >= 2 and r[i - 1] == h[j - 2] + h[j - 1]:
                cands.append((d[i - 1, j - 2], (i - 1, j - 2)))
            d[i, j], back[i, j] = min(cands, key=lambda c: c[0])
    diffs, i, j = [], n, m
    while (i, j) != (0, 0):
        pi, pj = back[i, j]
        if d[i, j] != d[pi, pj]:
            diffs.append(f"{' '.join(r[pi:i]) or '∅'} -> {' '.join(h[pj:j]) or '∅'}")
        i, j = pi, pj
    return int(d[n, m]), diffs[::-1]


class ASR:
    def __init__(self, size: str = "base.en"):
        from faster_whisper import WhisperModel

        self.size = size
        self.model = WhisperModel(size, device="cpu", compute_type="int8", cpu_threads=2)

    def transcribe(self, path) -> str:
        import soundfile as sf

        # Decoded here: faster-whisper's own file decoder does not work with the installed PyAV.
        x, sr = sf.read(str(path), dtype="float64")
        audio = resample(x, sr, 16000).astype(np.float32)
        segments, _ = self.model.transcribe(audio, language="en", beam_size=5, condition_on_previous_text=False)
        return " ".join(s.text.strip() for s in segments).strip()


def median_f0(x: np.ndarray, sr: int) -> tuple[float, np.ndarray]:
    """Median F0 over voiced frames (pYIN, 50-350 Hz). Returns (median, voiced f0 values)."""
    import librosa

    f0, voiced, _ = librosa.pyin(np.asarray(x, dtype=np.float32), fmin=50, fmax=350, sr=sr,
                                 frame_length=2048 * (sr // SR_K), hop_length=256 * (sr // SR_K))
    v = f0[voiced & np.isfinite(f0)]
    return (float(np.median(v)) if len(v) else float("nan")), v
