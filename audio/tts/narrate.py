#!/usr/bin/env python
"""Narration for "The Last Pets on Earth": Kokoro-82M line WAVs, word timings, parrot lines, report.

One command runs everything (voice selection -> pace calibration -> synthesis + timings -> parrot ->
ASR check -> report). Finished stages are cached in build/audio/tts_tmp, so a re-run only redoes what
changed in film/script.json:

    .venv-tts/bin/python audio/tts/narrate.py                  # everything (once: bash audio/tts/setup.sh)
    .venv-tts/bin/python audio/tts/narrate.py --only 3.4,3.5   # regenerate just these ids (parrot ids too)

Options: --force (ignore the synthesis cache), --no-verify, --reselect-voice, --recalibrate,
         --voice NAME, --base-speed X, --pitch SEMITONES (manual overrides), --stages a,b,...
Inputs:  film/script.json and, optionally, audio/tts/overrides.json:
         {"<line id>": {"synth": "same words, other punctuation or [word](/phonemes/) hints"}}
Outputs: build/audio/narration/<id>.wav, build/audio/parrot/<id>.wav, build/audio/narration.json,
         build/audio/tts_report.md
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time

import numpy as np

import parrot as parrot_fx
from report import write_report
from ttslib import (ASR, BUILD, NARR_DIR, NARR_JSON, PAD_S, PARROT_DIR, PEAK_DBFS, PRE, ROOT, SR_K, SR_OUT, TMP,
                    Engine, clamp_speed, lang_for, load_script, median_f0, moving_rms, process_line, speech_bounds,
                    validate_words, word_errors, write_wav)

CANDIDATES = ["am_michael", "am_fenrir", "bm_george", "am_onyx", "am_eric", "am_fenrir,am_michael",
              "bm_george,am_fenrir"]
QUALITY_GROUP = {"am_michael", "am_fenrir", "bm_george", "am_fenrir,am_michael", "bm_george,am_fenrir"}
PREFERRED = "am_fenrir,am_michael"  # wins a near-tie
NEAR_TIE_HZ = 3.0
TEST_LINES = ["1.6", "5.3", "10.10"]
F0_LIMIT_HZ = 112.0  # deeper than this needs no pitch shift
MAX_SHIFT_ST = -1.5
WPM_TOLERANCE = 1.0  # calibration stops inside target +/- this
STAGES = ["voice", "pace", "lines", "parrot", "verify", "report"]


def log(*a) -> None:
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def save_json(path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def rel(path) -> str:
    return str(path.relative_to(ROOT))


def save_narration(narr: dict) -> None:
    """narration.json with one line entry per text line (keeps the word lists readable and diffable)."""
    def block(name, entries, last):
        rows = [f"  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}" for k, v in entries.items()]
        return f' "{name}": {{\n' + ",\n".join(rows) + ("\n }" if rows else " }") + ("" if last else ",")

    head = [f" {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}," for k, v in narr.items()
            if k not in ("lines", "parrot")]
    text = "\n".join(["{", *head, block("lines", narr["lines"], False), block("parrot", narr["parrot"], True), "}"])
    assert json.loads(text) == narr
    NARR_JSON.write_text(text + "\n", encoding="utf-8")


# ----------------------------------------------------------------------------- stage: voice

def stage_voice(engine: Engine, lines, asr: ASR) -> dict:
    import soundfile as sf

    by_id = {ln.id: ln for ln in lines}
    (TMP / "voices").mkdir(parents=True, exist_ok=True)
    rows = []
    for cand in CANDIDATES:
        pooled, n_words, speech, errors, per_line = [], 0, 0.0, 0, []
        for lid in TEST_LINES:
            ln = by_id[lid]
            syn = engine.synth(ln.synth, cand, 1.0)
            x = syn.audio.astype(np.float64)
            on, off = speech_bounds(x, SR_K)
            seg = x[on:off + 1]
            med, voiced = median_f0(seg, SR_K)
            path = TMP / "voices" / f"{cand.replace(',', '+')}__{lid}.wav"
            sf.write(path, seg, SR_K, subtype="PCM_16")
            hyp = asr.transcribe(path)
            err, diffs = word_errors(ln.spoken, hyp)
            nw = len(ln.spoken.split())
            pooled.append(voiced)
            n_words += nw
            speech += len(seg) / SR_K
            errors += err
            per_line.append({"id": lid, "median_f0": round(med, 1), "speech_s": round(len(seg) / SR_K, 3),
                             "words": nw, "asr": hyp, "asr_errors": err, "diffs": diffs})
        v = np.concatenate(pooled)
        rows.append({
            "voice": cand, "lang": lang_for(cand), "median_f0": round(float(np.median(v)), 1),
            "f0_p05": round(float(np.percentile(v, 5)), 1), "f0_p95": round(float(np.percentile(v, 95)), 1),
            "words_per_s": round(n_words / speech, 3), "asr_errors": errors,
            "quality_group": cand in QUALITY_GROUP, "lines": per_line,
        })
        log(f"voice {cand:22} F0 {rows[-1]['median_f0']:6.1f} Hz  {rows[-1]['words_per_s']:.2f} w/s  "
            f"ASR errors {errors}")

    eligible = [r for r in rows if r["quality_group"] and r["asr_errors"] == 0]
    note = ""
    if not eligible:
        fewest = min(r["asr_errors"] for r in rows if r["quality_group"])
        eligible = [r for r in rows if r["quality_group"] and r["asr_errors"] == fewest]
        note = f"no quality-group candidate had zero ASR errors; used those with the fewest ({fewest})"
    best = min(eligible, key=lambda r: r["median_f0"])
    pref = next((r for r in eligible if r["voice"] == PREFERRED), None)
    rule = "lowest median F0 among zero-error quality-group candidates"
    if pref is not None and pref is not best and pref["median_f0"] - best["median_f0"] <= NEAR_TIE_HZ:
        rule = (f"near-tie: {PREFERRED} is within {NEAR_TIE_HZ:g} Hz of the lowest "
                f"({best['voice']}, {best['median_f0']} Hz)")
        best = pref
    shift = 0.0
    if best["median_f0"] > F0_LIMIT_HZ:  # just enough to reach the limit, capped
        shift = round(max(MAX_SHIFT_ST, 12 * math.log2(F0_LIMIT_HZ / best["median_f0"])), 2)
    sel = {"chosen": best["voice"], "lang": best["lang"], "rule": rule, "note": note,
           "median_f0": best["median_f0"], "pitch_shift_semitones": shift, "test_lines": TEST_LINES,
           "asr_model": asr.size, "candidates": rows}
    save_json(TMP / "voice_selection.json", sel)
    log(f"chosen voice: {best['voice']} ({rule}); pitch shift {shift} st")
    return sel


# ----------------------------------------------------------------------------- stage: pace

def measure_wpm(engine: Engine, lines, voice: str, speed: float) -> tuple[float, int, float]:
    words, speech = 0, 0.0
    for ln in lines:
        p = process_line(engine.synth(ln.synth, voice, speed), ln.text, ln.spoken)
        words += len(ln.text.split())
        speech += p.dur - 2 * PAD_S
    return 60 * words / speech, words, speech


def stage_pace(engine: Engine, lines, voice: str, target: float) -> dict:
    unit = [ln for ln in lines if abs(ln.speed - 1.0) < 1e-9]
    wpm1, words, speech1 = measure_wpm(engine, unit, voice, 1.0)
    log(f"pace: {len(unit)} lines with multiplier 1.0, {words} words; Kokoro speed 1.0 -> "
        f"{words / speech1:.3f} words/s = {wpm1:.1f} wpm")
    base, history = clamp_speed(round(target / wpm1, 3)), []
    for _ in range(4):
        wpm, _, _ = measure_wpm(engine, unit, voice, clamp_speed(base))
        history.append({"base_speed": base, "wpm": round(wpm, 2)})
        log(f"pace: base speed {base} -> {wpm:.1f} wpm")
        if abs(wpm - target) <= WPM_TOLERANCE:
            break
        base = clamp_speed(round(base * target / wpm, 3))
    best = min(history, key=lambda h: abs(h["wpm"] - target))
    cal = {"voice": voice, "target_wpm": target, "lines": len(unit), "words": words,
           "words_per_s_speed1": round(words / speech1, 4), "wpm_speed1": round(wpm1, 2),
           "base_speed": best["base_speed"], "wpm_at_base": best["wpm"], "history": history}
    save_json(TMP / "calibration.json", cal)
    return cal


# ----------------------------------------------------------------------------- stage: lines

def stage_lines(engine: Engine, lines, voice: str, base: float, pitch: float, ids: set, force: bool) -> None:
    PRE.mkdir(parents=True, exist_ok=True)
    for ln in lines:
        if ln.id not in ids:
            continue
        speed = clamp_speed(base * ln.speed)
        syn = engine.synth(ln.synth, voice, speed, use_cache=not force)
        p = process_line(syn, ln.text, ln.spoken, pitch)
        np.save(PRE / f"{ln.id}.npy", p.audio.astype(np.float32))
        save_json(PRE / f"{ln.id}.json", {
            "id": ln.id, "voice": voice, "base_speed": base, "pitch": pitch, "speed": speed, "text": ln.text,
            "spoken": ln.spoken, "synth": ln.synth, "dur": p.dur, "words": p.words, **p.info})
        extra = "".join(f" | ellipsis '{e['word']}' pause {e['acoustic_pause']}s -> {e['final_pause']}s"
                        for e in p.info["ellipses"])
        log(f"line {ln.id:6} speed {speed:.3f} dur {p.dur:7.3f}s words {len(p.words):3}{extra}")


def stage_finalize(lines, engine_name: str, voice: str, base: float, pitch: float, processed: set) -> dict:
    """Apply the single global gain, write the WAVs that changed, and write narration.json."""
    metas = {}
    for ln in lines:
        meta = load_json(PRE / f"{ln.id}.json")
        if meta is None:
            sys.exit(f"line {ln.id} has not been synthesized yet: run once without --only")
        if (meta["voice"], meta["base_speed"], meta["pitch"], meta["text"], meta["synth"]) != \
                (voice, base, pitch, ln.text, ln.synth):
            log(f"WARNING: line {ln.id} is stale (script, voice or pace changed since it was generated)")
        validate_words(meta["words"], ln.text.split(), meta["dur"])
        metas[ln.id] = meta
    gain_db = round(PEAK_DBFS - 20 * math.log10(max(m["peak"] for m in metas.values())), 6)
    old = load_json(NARR_JSON) or {}
    regain = abs(old.get("gain_db", 1e9) - gain_db) > 1e-6
    if regain and old:
        log(f"global gain changed ({old.get('gain_db')} -> {gain_db} dB): rewriting every line WAV")
    for ln in lines:
        path = NARR_DIR / f"{ln.id}.wav"
        if regain or ln.id in processed or not path.exists():
            write_wav(path, np.load(PRE / f"{ln.id}.npy").astype(np.float64) * 10 ** (gain_db / 20))
    narr = {
        "engine": engine_name, "voice": voice, "base_speed": base, "pitch_shift_semitones": pitch,
        "sample_rate": SR_OUT, "gain_db": gain_db,
        "lines": {ln.id: {"file": rel(NARR_DIR / f"{ln.id}.wav"), "dur": round(metas[ln.id]["dur"], 6),
                          "speed": metas[ln.id]["speed"], "words": metas[ln.id]["words"]} for ln in lines},
        "parrot": old.get("parrot", {}),
    }
    save_narration(narr)
    total = sum(v["dur"] for v in narr["lines"].values())
    log(f"wrote {rel(NARR_JSON)}: {len(narr['lines'])} lines, {total:.1f}s of speech, gain {gain_db:+.2f} dB")
    return narr


# ----------------------------------------------------------------------------- stage: parrot

def stage_parrot(engine: Engine, parrot, ids: set, force: bool) -> None:
    narr = load_json(NARR_JSON)
    if narr is None:
        sys.exit("narration.json does not exist yet: run the lines stage first")
    done = dict(narr.get("parrot", {}))
    for pid, text in parrot:
        if pid not in ids:
            continue
        syn = engine.synth(text, parrot_fx.VOICE, parrot_fx.KOKORO_SPEED, use_cache=not force)
        y = parrot_fx.parrotize(syn.audio.astype(np.float64), pid)
        write_wav(PARROT_DIR / f"{pid}.wav", y)
        done[pid] = {"file": rel(PARROT_DIR / f"{pid}.wav"), "dur": round(len(y) / SR_OUT, 6)}
        log(f"parrot {pid:10} dur {done[pid]['dur']:.3f}s")
    narr["parrot"] = {pid: done[pid] for pid, _ in parrot if pid in done}
    save_narration(narr)


# ----------------------------------------------------------------------------- stage: verify

def stage_verify(lines, parrot, ids: set, get_asr) -> dict:
    ver = load_json(TMP / "verify.json") or {}
    todo = [(ln.id, ln.spoken, NARR_DIR / f"{ln.id}.wav") for ln in lines if ln.id in ids]
    todo += [(pid, text, PARROT_DIR / f"{pid}.wav") for pid, text in parrot if pid in ids]
    failing = []
    for lid, ref, path in todo:
        hyp = get_asr("base.en").transcribe(path)
        err, diffs = word_errors(ref, hyp)
        ver[lid] = {"ref": ref, "base.en": {"hyp": hyp, "errors": err, "diffs": diffs}}
        if err:
            failing.append((lid, ref, path))
            log(f"verify {lid}: {err} mismatch(es) {diffs} | heard: {hyp}")
    for lid, ref, path in failing:  # second opinion from a larger model
        hyp = get_asr("small.en").transcribe(path)
        err, diffs = word_errors(ref, hyp)
        ver[lid]["small.en"] = {"hyp": hyp, "errors": err, "diffs": diffs}
        log(f"verify {lid} (small.en): {err} mismatch(es) {diffs} | heard: {hyp}")
    save_json(TMP / "verify.json", ver)
    log(f"verified {len(todo)} files with base.en: {len(todo) - len(failing)} match, {len(failing)} differ")
    return ver


def stage_pitch_check(engine: Engine, lines, voice: str, base: float, pitch: float) -> None:
    """Durations with and without the pitch shift, timing alignment and the F0 actually reached."""
    rows, f0_before, f0_after = [], [], []
    for ln in lines:
        syn = engine.synth(ln.synth, voice, clamp_speed(base * ln.speed))
        plain = process_line(syn, ln.text, ln.spoken, 0.0)
        shifted = np.load(PRE / f"{ln.id}.npy").astype(np.float64)
        row = {"id": ln.id, "dur_plain": plain.dur, "dur_shifted": len(shifted) / SR_OUT}
        if ln.id in TEST_LINES:
            ea, eb = (moving_rms(s, 480)[::48] for s in (plain.audio, shifted))  # 1 kHz envelopes
            n = min(len(ea), len(eb))
            lags = range(-20, 21)
            cc = [float(np.dot(ea[max(0, -k):n - max(0, k)], eb[max(0, k):n - max(0, -k)])) for k in lags]
            row["envelope_lag_ms"] = lags[int(np.argmax(cc))]
            f0_before.append(median_f0(plain.audio, SR_OUT)[1])
            f0_after.append(median_f0(shifted, SR_OUT)[1])
        rows.append(row)
    worst = max(abs(r["dur_plain"] - r["dur_shifted"]) for r in rows)
    chk = {"pitch_shift_semitones": pitch, "max_duration_change_ms": round(1000 * worst, 4),
           "median_f0_before": round(float(np.median(np.concatenate(f0_before))), 1),
           "median_f0_after": round(float(np.median(np.concatenate(f0_after))), 1), "lines": rows}
    save_json(TMP / "pitch_check.json", chk)
    log(f"pitch check: max duration change {chk['max_duration_change_ms']} ms; median F0 "
        f"{chk['median_f0_before']} -> {chk['median_f0_after']} Hz")
    assert worst < 0.001, "pitch shift changed a duration by 1 ms or more"


# ----------------------------------------------------------------------------- main

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", default="", help="comma-separated line and/or parrot ids to regenerate")
    ap.add_argument("--force", action="store_true", help="ignore the synthesis cache")
    ap.add_argument("--no-verify", action="store_true", help="skip the faster-whisper check")
    ap.add_argument("--reselect-voice", action="store_true")
    ap.add_argument("--recalibrate", action="store_true")
    ap.add_argument("--voice")
    ap.add_argument("--base-speed", type=float)
    ap.add_argument("--pitch", type=float)
    ap.add_argument("--stages", default=",".join(STAGES), help=f"subset of: {','.join(STAGES)}")
    args = ap.parse_args()

    lines, parrot, meta = load_script()
    stages = set(args.stages.split(",")) - ({"verify"} if args.no_verify else set())
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    known = {ln.id for ln in lines} | {pid for pid, _ in parrot}
    if only - known:
        sys.exit(f"unknown id(s): {sorted(only - known)}")
    ids = only or known
    for d in (TMP, NARR_DIR, PARROT_DIR):
        d.mkdir(parents=True, exist_ok=True)

    engine, asrs = Engine(), {}

    def get_asr(size: str = "base.en") -> ASR:
        if size not in asrs:
            asrs[size] = ASR(size)
        return asrs[size]

    sel = load_json(TMP / "voice_selection.json")
    if "voice" in stages and not args.voice and (sel is None or args.reselect_voice):
        sel = stage_voice(engine, lines, get_asr())
    voice = args.voice or (sel or {}).get("chosen")
    if not voice:
        sys.exit("no voice selected yet: include the 'voice' stage or pass --voice")
    pitch = args.pitch if args.pitch is not None else \
        (sel["pitch_shift_semitones"] if sel and sel["chosen"] == voice else 0.0)

    cal = load_json(TMP / "calibration.json")
    if args.base_speed:
        base = args.base_speed
    else:
        if cal is None or cal["voice"] != voice or args.recalibrate:
            if "pace" not in stages:
                sys.exit("no pace calibration for this voice yet: include the 'pace' stage or pass --base-speed")
            cal = stage_pace(engine, lines, voice, float(meta.get("pace_wpm", 150)))
        base = cal["base_speed"]
    engine_name = f"Kokoro-82M (kokoro {engine.version}, {lang_for(voice)})"
    log(f"voice {voice} | base speed {base} | pitch shift {pitch} st")

    line_ids = {ln.id for ln in lines} & ids
    if "lines" in stages and line_ids:
        stage_lines(engine, lines, voice, base, pitch, line_ids, args.force)
        stage_finalize(lines, engine_name, voice, base, pitch, line_ids)
        if pitch and not only:
            stage_pitch_check(engine, lines, voice, base, pitch)
    if "parrot" in stages and ids & {pid for pid, _ in parrot}:
        stage_parrot(engine, parrot, ids, args.force)
    if "verify" in stages:
        stage_verify(lines, parrot, ids, get_asr)
    if "report" in stages:
        write_report(lines, parrot)
        log(f"wrote {rel(BUILD / 'tts_report.md')}")


if __name__ == "__main__":
    main()
