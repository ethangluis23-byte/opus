# Narration report: The Last Pets on Earth

- Engine: Kokoro-82M (kokoro 0.9.4, a); official `kokoro` package (KPipeline), model hexgrad/Kokoro-82M, Apache-2.0.
- Voice: `am_michael` (lowest median F0 among zero-error quality-group candidates)
- Base speed: 0.88 (per-line Kokoro speed = base x line multiplier, clamped to 0.8-1.1).
- Pitch shift: -0.53 semitones (formant-preserving, Rubber Band R3).
- Files: 74 lines, 48 kHz mono 24-bit PCM, 20 ms lead/tail, one global gain of +1.84 dB (loudest line peaks at -3 dBFS).
- Totals: 1075 words, 432.5 s of narration (7.21 min); lines with multiplier 1.0 run at 149.2 wpm.

## Voice candidates

Test lines 1.6, 5.3, 10.10 at Kokoro speed 1.0. F0: pYIN (50-350 Hz), median over the voiced frames of the three lines pooled. Rate: words per second of speech (silence trimmed at both ends). ASR: faster-whisper base.en (CPU, int8), word errors after normalization.

| voice | lang | median F0 (Hz) | F0 5-95% (Hz) | words/s | ASR word errors | quality group |
|---|---|---|---|---|---|---|
| `am_michael` **(chosen)** | a | 115.5 | 91.7-160.6 | 2.787 | 0 | yes |
| `am_fenrir` | a | 132.0 | 92.2-220.9 | 3.034 | 1 | yes |
| `bm_george` | b | 142.2 | 81.0-180.3 | 2.765 | 0 | yes |
| `am_onyx` | a | 85.6 | 50.0-112.9 | 3.129 | 0 | no |
| `am_eric` | a | 161.5 | 101.2-223.5 | 3.548 | 2 | no |
| `am_fenrir,am_michael` | a | 127.5 | 92.8-181.5 | 2.88 | 0 | yes |
| `bm_george,am_fenrir` | a | 141.4 | 95.2-194.3 | 2.892 | 0 | yes |

- `am_fenrir` line 1.6: certain -> cert
- `am_eric` line 5.3: dog -> ∅; packs -> dogpaks
Rule applied: lowest median F0 among zero-error quality-group candidates.

## Pace

- Final files: lines with multiplier 1.0 average 149.2 wpm (target 150 +/- 4), measured on speech only, i.e. file duration minus the two 20 ms pads, pauses inside a line included.

## Pitch

- Shifted by -0.53 semitones with formant preservation. Median F0 on the test lines: 116.2 Hz before, 114.2 Hz after.
- Durations: largest change over all 74 lines is 0.0 ms (trim points are taken from the unshifted signal).
- Envelope lag between shifted and unshifted test lines: 1.6: 1 ms, 5.3: 0 ms, 10.10: 0 ms.

## Scenes

| scene | lines | words | speech (s) |
|---|---|---|---|
| 1 | 10 | 123 | 44.83 |
| 2 | 7 | 115 | 44.23 |
| 3 | 7 | 106 | 40.42 |
| 4 | 7 | 114 | 48.46 |
| 5 | 7 | 103 | 43.81 |
| 6 | 6 | 107 | 41.83 |
| 7 | 7 | 106 | 42.53 |
| 8 | 7 | 111 | 46.75 |
| 9 | 6 | 94 | 41.66 |
| 10 | 10 | 96 | 38.02 |
| **total** | 74 | 1075 | 432.54 |

## Lines

| id | multiplier | Kokoro speed | words | duration (s) |
|---|---|---|---|---|
| 1.1 | 1.02 | 0.8976 | 13 | 4.644 |
| 1.2 | 1.02 | 0.8976 | 14 | 5.507 |
| 1.3 | 1.02 | 0.8976 | 16 | 4.830 |
| 1.4a | 1 | 0.88 | 6 | 3.014 |
| 1.4b | 0.94 | 0.8272 | 3 | 1.334 |
| 1.5 | 1 | 0.88 | 12 | 6.097 |
| 1.6 | 1 | 0.88 | 16 | 5.639 |
| 1.7 | 1 | 0.88 | 14 | 4.648 |
| 1.8 | 1 | 0.88 | 19 | 6.341 |
| 1.9 | 0.97 | 0.8536 | 10 | 2.779 |
| 2.1 | 1 | 0.88 | 18 | 7.029 |
| 2.2 | 1 | 0.88 | 20 | 6.933 |
| 2.3 | 1 | 0.88 | 13 | 5.138 |
| 2.4 | 1 | 0.88 | 14 | 6.082 |
| 2.5 | 1 | 0.88 | 15 | 5.197 |
| 2.6 | 1 | 0.88 | 24 | 9.527 |
| 2.7 | 1 | 0.88 | 11 | 4.322 |
| 3.1 | 1 | 0.88 | 15 | 5.782 |
| 3.2 | 1 | 0.88 | 19 | 6.053 |
| 3.3 | 1 | 0.88 | 16 | 5.967 |
| 3.4 | 1 | 0.88 | 18 | 7.960 |
| 3.5 | 1 | 0.88 | 10 | 3.994 |
| 3.6 | 1 | 0.88 | 14 | 5.734 |
| 3.7 | 1 | 0.88 | 14 | 4.925 |
| 4.1 | 1 | 0.88 | 12 | 5.213 |
| 4.2 | 1 | 0.88 | 16 | 7.032 |
| 4.3 | 1 | 0.88 | 28 | 12.893 |
| 4.4 | 1 | 0.88 | 11 | 4.451 |
| 4.5 | 1 | 0.88 | 15 | 5.971 |
| 4.6 | 1 | 0.88 | 13 | 5.009 |
| 4.7 | 1 | 0.88 | 19 | 7.895 |
| 5.1 | 1 | 0.88 | 18 | 8.347 |
| 5.2 | 1 | 0.88 | 15 | 5.777 |
| 5.3 | 1 | 0.88 | 25 | 11.285 |
| 5.4 | 1 | 0.88 | 13 | 6.251 |
| 5.5 | 1 | 0.88 | 8 | 3.135 |
| 5.6 | 1 | 0.88 | 16 | 6.501 |
| 5.7 | 0.95 | 0.836 | 8 | 2.519 |
| 6.1 | 1 | 0.88 | 21 | 8.193 |
| 6.2 | 1 | 0.88 | 17 | 5.380 |
| 6.3 | 1 | 0.88 | 24 | 10.570 |
| 6.4 | 1 | 0.88 | 13 | 4.836 |
| 6.5 | 1 | 0.88 | 9 | 4.119 |
| 6.6 | 0.97 | 0.8536 | 23 | 8.734 |
| 7.1 | 1 | 0.88 | 14 | 6.060 |
| 7.2 | 1 | 0.88 | 15 | 6.357 |
| 7.3 | 1 | 0.88 | 19 | 7.894 |
| 7.4 | 1 | 0.88 | 13 | 5.152 |
| 7.5 | 1 | 0.88 | 19 | 7.634 |
| 7.6 | 1 | 0.88 | 11 | 4.081 |
| 7.7 | 1 | 0.88 | 15 | 5.350 |
| 8.1 | 1 | 0.88 | 12 | 5.512 |
| 8.2 | 1 | 0.88 | 19 | 8.675 |
| 8.3 | 1 | 0.88 | 23 | 9.866 |
| 8.4 | 0.94 | 0.8272 | 8 | 3.765 |
| 8.5 | 0.94 | 0.8272 | 10 | 4.671 |
| 8.6 | 0.94 | 0.8272 | 22 | 8.083 |
| 8.7 | 0.94 | 0.8272 | 17 | 6.175 |
| 9.1 | 0.97 | 0.8536 | 12 | 5.416 |
| 9.2 | 0.97 | 0.8536 | 14 | 6.226 |
| 9.3 | 0.97 | 0.8536 | 12 | 4.689 |
| 9.4 | 0.97 | 0.8536 | 31 | 14.732 |
| 9.5 | 0.97 | 0.8536 | 10 | 4.031 |
| 9.6 | 0.95 | 0.836 | 15 | 6.570 |
| 10.1 | 0.92 | 0.8096 | 9 | 5.800 |
| 10.2 | 0.92 | 0.8096 | 3 | 1.494 |
| 10.3 | 0.92 | 0.8096 | 7 | 2.607 |
| 10.4 | 0.92 | 0.8096 | 13 | 5.446 |
| 10.5 | 0.92 | 0.8096 | 10 | 3.212 |
| 10.6 | 0.96 | 0.8448 | 21 | 8.503 |
| 10.7 | 0.96 | 0.8448 | 9 | 2.665 |
| 10.8 | 0.96 | 0.8448 | 6 | 1.867 |
| 10.9 | 0.9 | 0.8 | 10 | 3.576 |
| 10.10 | 0.88 | 0.8 | 8 | 2.845 |

## Ellipsis pauses

Acoustic pause = silent run (10 ms RMS below -45 dB re the line peak) between the word and the next one. Below 0.3 s silence is spliced in up to 0.45 s; above 0.7 s it is shortened. Kokoro gap = the duration Kokoro assigns to the "..." tokens.

| line | word | Kokoro gap (s) | acoustic pause (s) | spliced (s) | final pause (s) |
|---|---|---|---|---|---|
| 1.1 | pets... | 0.163 | 0.446 | 0.0 | 0.446 |
| 1.8 | owner... | 0.188 | 0.592 | 0.0 | 0.592 |
| 2.3 | blink... | 0.125 | 0.343 | 0.0 | 0.343 |
| 2.7 | luck... | 0.15 | 0.476 | 0.0 | 0.476 |
| 4.3 | best... | 0.162 | 0.469 | 0.0 | 0.469 |
| 5.2 | found... | 0.188 | 0.449 | 0.0 | 0.449 |
| 6.6 | years... | 0.15 | 0.504 | 0.0 | 0.504 |
| 9.6 | pet... | 0.163 | 0.531 | 0.0 | 0.531 |

Lines ending in an ellipsis (1.4a) have no in-line pause to check: the file ends 20 ms after the last word, so that pause belongs to the mix.

## Verification (faster-whisper)

- base.en (CPU, int8) on the final WAVs: 0 of 0 checked lines match the spoken text after normalization (case, punctuation, number formatting, split/joined compounds). Not checked: 1.1, 1.2, 1.3, 1.4a, 1.4b, 1.5, 1.6, 1.7, 1.8, 1.9, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10.
- No line needed a punctuation or phoneme override.
- Word timings: from Kokoro's token timestamps; interpolated words: none; lines split into several chunks: none.

## Parrot lines

`af_heart` synthesized at Kokoro speed 0.8241, then a plain resample shift of +5 semitones (pitch and formants, 1.335x faster, net tempo 1.1x), band-pass 700-5500 Hz, 80 Hz amplitude modulation at 35% depth, tanh saturation, and a 45 ms noisy downward chirp in front. Each file peaks at -3 dBFS.

| id | text | duration (s) | ASR on the processed file |
|---|---|---|---|
| p_hello | Hello! | 0.521 | not checked |
| p_morning | Good morning! | 0.723 | not checked |
| p_goodboy | Good boy! | 0.670 | not checked |
| p_hello_q | Hello? | 0.546 | not checked |

## Regenerating

```
.venv-tts/bin/python audio/tts/narrate.py                 # everything; unchanged lines come from the cache
.venv-tts/bin/python audio/tts/narrate.py --only 3.4,3.5  # only these ids (parrot ids work too)
```

Trim: speech starts where the 5 ms RMS first exceeds -50 dB re the line peak. A changed line keeps the stored voice, base speed and pitch; if it becomes the loudest line the global gain changes and every WAV is rewritten (durations and timings stay the same).
