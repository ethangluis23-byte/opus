"""Builds build/audio/tts_report.md from the pipeline's state files (narration.json + build/audio/tts_tmp)."""
from __future__ import annotations

import json

import parrot as parrot_fx
from ttslib import (ELLIPSIS_MAX, ELLIPSIS_MIN, ELLIPSIS_TARGET, NARR_JSON, OVERRIDES, PAD_S, PAUSE_DB, PEAK_DBFS,
                    PRE, REPORT, SPEED_MAX, SPEED_MIN, TMP, TRIM_DB, is_ellipsis)


def _load(path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def _table(head: list[str], rows: list[list]) -> list[str]:
    out = ["| " + " | ".join(head) + " |", "|" + "|".join("---" for _ in head) + "|"]
    return out + ["| " + " | ".join(str(c) for c in r) + " |" for r in rows] + [""]


def write_report(lines, parrot) -> str:
    narr = _load(NARR_JSON)
    sel = _load(TMP / "voice_selection.json")
    cal = _load(TMP / "calibration.json")
    ver = _load(TMP / "verify.json") or {}
    chk = _load(TMP / "pitch_check.json")
    overrides = _load(OVERRIDES) or {}
    pre = {ln.id: _load(PRE / f"{ln.id}.json") for ln in lines}
    L = narr["lines"]
    n_words = {ln.id: len(ln.text.split()) for ln in lines}
    total_words, total_dur = sum(n_words.values()), sum(v["dur"] for v in L.values())
    unit = [ln for ln in lines if abs(ln.speed - 1.0) < 1e-9]
    unit_wpm = 60 * sum(n_words[ln.id] for ln in unit) / sum(L[ln.id]["dur"] - 2 * PAD_S for ln in unit)
    pitch = narr["pitch_shift_semitones"]

    md = ["# Narration report: The Last Pets on Earth", ""]
    md += [
        f"- Engine: {narr['engine']}; official `kokoro` package (KPipeline), model hexgrad/Kokoro-82M, Apache-2.0.",
        f"- Voice: `{narr['voice']}`" + (f" ({sel['rule']})" if sel and sel["chosen"] == narr["voice"] else ""),
        f"- Base speed: {narr['base_speed']} (per-line Kokoro speed = base x line multiplier, clamped to "
        f"{SPEED_MIN}-{SPEED_MAX}).",
        f"- Pitch shift: {pitch} semitones" + (" (formant-preserving, Rubber Band R3)." if pitch else " (none)."),
        f"- Files: {len(L)} lines, 48 kHz mono 24-bit PCM, {int(PAD_S * 1000)} ms lead/tail, one global gain "
        f"of {narr['gain_db']:+.2f} dB (loudest line peaks at {PEAK_DBFS:g} dBFS).",
        f"- Totals: {total_words} words, {total_dur:.1f} s of narration ({total_dur / 60:.2f} min); lines with "
        f"multiplier 1.0 run at {unit_wpm:.1f} wpm.",
        "",
    ]

    if sel:
        md += ["## Voice candidates", "",
               f"Test lines {', '.join(sel['test_lines'])} at Kokoro speed 1.0. F0: pYIN (50-350 Hz), median over "
               f"the voiced frames of the three lines pooled. Rate: words per second of speech (silence trimmed at "
               f"both ends). ASR: faster-whisper {sel['asr_model']} (CPU, int8), word errors after normalization.", ""]
        rows = [[f"`{r['voice']}`" + (" **(chosen)**" if r["voice"] == sel["chosen"] else ""), r["lang"],
                 r["median_f0"], f"{r['f0_p05']}-{r['f0_p95']}", r["words_per_s"], r["asr_errors"],
                 "yes" if r["quality_group"] else "no"] for r in sel["candidates"]]
        md += _table(["voice", "lang", "median F0 (Hz)", "F0 5-95% (Hz)", "words/s", "ASR word errors",
                      "quality group"], rows)
        for r in sel["candidates"]:
            for ln in r["lines"]:
                if ln["asr_errors"]:
                    md.append(f"- `{r['voice']}` line {ln['id']}: {'; '.join(ln['diffs'])}")
        md += [f"Rule applied: {sel['rule']}." + (f" Note: {sel['note']}." if sel["note"] else ""), ""]

    md += ["## Pace", ""]
    if cal and cal["voice"] == narr["voice"]:
        md += [f"- At Kokoro speed 1.0 the {cal['lines']} lines with multiplier 1.0 ({cal['words']} words) run at "
               f"{cal['words_per_s_speed1']} words/s = {cal['wpm_speed1']} wpm.",
               "- Calibration: " + ", ".join(f"base {h['base_speed']} -> {h['wpm']} wpm" for h in cal["history"]) + "."]
    md += [f"- Final files: lines with multiplier 1.0 average {unit_wpm:.1f} wpm (target "
           f"{cal['target_wpm'] if cal else 150:g} +/- 4), measured on speech only, i.e. file duration minus the "
           f"two {int(PAD_S * 1000)} ms pads, pauses inside a line included.", ""]

    md += ["## Pitch", ""]
    if pitch and chk:
        md += [f"- Shifted by {pitch} semitones with formant preservation. Median F0 on the test lines: "
               f"{chk['median_f0_before']} Hz before, {chk['median_f0_after']} Hz after.",
               f"- Durations: largest change over all {len(chk['lines'])} lines is "
               f"{chk['max_duration_change_ms']} ms (trim points are taken from the unshifted signal).",
               "- Envelope lag between shifted and unshifted test lines: "
               + ", ".join(f"{r['id']}: {r['envelope_lag_ms']} ms" for r in chk["lines"] if "envelope_lag_ms" in r)
               + ".", ""]
    else:
        md += [f"- Not pitch-shifted" + (f": the chosen voice's median F0 is {sel['median_f0']} Hz." if sel else "."),
               ""]

    md += ["## Scenes", ""]
    scenes: dict = {}
    for ln in lines:
        s = scenes.setdefault(ln.scene, [0, 0, 0.0])
        s[0] += 1
        s[1] += n_words[ln.id]
        s[2] += L[ln.id]["dur"]
    md += _table(["scene", "lines", "words", "speech (s)"],
                 [[k, v[0], v[1], f"{v[2]:.2f}"] for k, v in scenes.items()]
                 + [["**total**", len(lines), total_words, f"{total_dur:.2f}"]])

    md += ["## Lines", ""]
    md += _table(["id", "multiplier", "Kokoro speed", "words", "duration (s)"],
                 [[ln.id, f"{ln.speed:g}", L[ln.id]["speed"], n_words[ln.id], f"{L[ln.id]['dur']:.3f}"]
                  for ln in lines])

    md += ["## Ellipsis pauses", "",
           f"Acoustic pause = silent run (10 ms RMS below {PAUSE_DB:g} dB re the line peak) between the word and "
           f"the next one. Below {ELLIPSIS_MIN} s silence is spliced in up to {ELLIPSIS_TARGET} s; above "
           f"{ELLIPSIS_MAX} s it is shortened. Kokoro gap = the duration Kokoro assigns to the \"...\" tokens.", ""]
    rows = []
    for ln in lines:
        for e in (pre[ln.id] or {}).get("ellipses", []):
            rows.append([ln.id, e["word"], e["kokoro_punct_gap"], e["acoustic_pause"], e["spliced"], e["final_pause"]])
    md += _table(["line", "word", "Kokoro gap (s)", "acoustic pause (s)", "spliced (s)", "final pause (s)"], rows)
    trailing = [ln.id for ln in lines if is_ellipsis(ln.spoken.split()[-1])]
    if trailing:
        md += [f"Lines ending in an ellipsis ({', '.join(trailing)}) have no in-line pause to check: the file ends "
               f"{int(PAD_S * 1000)} ms after the last word, so that pause belongs to the mix.", ""]

    md += ["## Verification (faster-whisper)", ""]
    line_ids = [ln.id for ln in lines]
    checked = [i for i in line_ids if i in ver]
    bad = [i for i in checked if ver[i]["base.en"]["errors"]]
    md += [f"- base.en (CPU, int8) on the final WAVs: {len(checked) - len(bad)} of {len(checked)} checked lines "
           f"match the spoken text after normalization (case, punctuation, number formatting, split/joined "
           f"compounds)." + (f" Not checked: {', '.join(i for i in line_ids if i not in ver)}."
                             if len(checked) < len(line_ids) else "")]
    for i in bad:
        v = ver[i]
        second = v.get("small.en")
        md.append(f"- {i}: base.en heard \"{v['base.en']['hyp']}\" ({'; '.join(v['base.en']['diffs'])})"
                  + (f"; small.en heard \"{second['hyp']}\" ({second['errors']} errors)" if second else ""))
    if overrides:
        md.append("- Lines synthesized from an override (same words, different punctuation or phoneme hints): "
                  + "; ".join(f"{k}: `{v['synth']}`" for k, v in overrides.items()))
    else:
        md.append("- No line needed a punctuation or phoneme override.")
    interp = [i for i in line_ids if (pre[i] or {}).get("interpolated_words")]
    multi = [i for i in line_ids if (pre[i] or {}).get("chunks", 1) > 1]
    md += [f"- Word timings: from Kokoro's token timestamps; interpolated words: "
           f"{', '.join(interp) if interp else 'none'}; lines split into several chunks: "
           f"{', '.join(multi) if multi else 'none'}.", ""]

    md += ["## Parrot lines", "",
           f"`{parrot_fx.VOICE}` synthesized at Kokoro speed {parrot_fx.KOKORO_SPEED}, then a plain resample shift of "
           f"+{parrot_fx.SEMITONES:g} semitones (pitch and formants, {parrot_fx.RATIO:.3f}x faster, net tempo "
           f"{parrot_fx.NET_SPEED}x), band-pass {parrot_fx.BAND_HZ[0]:g}-{parrot_fx.BAND_HZ[1]:g} Hz, "
           f"{parrot_fx.AM_HZ:g} Hz amplitude modulation at {int(parrot_fx.AM_DEPTH * 100)}% depth, tanh saturation, "
           f"and a {int(parrot_fx.SQUAWK_S * 1000)} ms noisy downward chirp in front. Each file peaks at "
           f"{PEAK_DBFS:g} dBFS.", ""]
    rows = []
    for pid, text in parrot:
        p = narr["parrot"].get(pid)
        v = ver.get(pid, {})
        heard = " / ".join(f"{m}: \"{v[m]['hyp']}\" ({v[m]['errors']} errors)" for m in ("base.en", "small.en") if m in v)
        rows.append([pid, text, f"{p['dur']:.3f}" if p else "missing", heard or "not checked"])
    md += _table(["id", "text", "duration (s)", "ASR on the processed file"], rows)

    md += ["## Regenerating", "",
           "```", ".venv-tts/bin/python audio/tts/narrate.py                 # everything; unchanged lines come from the cache",
           ".venv-tts/bin/python audio/tts/narrate.py --only 3.4,3.5  # only these ids (parrot ids work too)", "```",
           "",
           f"Trim: speech starts where the 5 ms RMS first exceeds {TRIM_DB:g} dB re the line peak. A changed line keeps "
           f"the stored voice, base speed and pitch; if it becomes the loudest line the global gain changes and every "
           f"WAV is rewritten (durations and timings stay the same).", ""]
    text = "\n".join(md)
    REPORT.write_text(text, encoding="utf-8")
    return text
