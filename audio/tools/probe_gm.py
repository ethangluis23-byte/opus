"""Measure attack time / level / release of FluidR3_GM programs (development aid)."""
import os
import subprocess
import sys
import tempfile

import mido
import numpy as np
import soundfile as sf

SF2 = "/usr/share/sounds/sf2/FluidR3_GM.sf2"
PROGS = {
    0: ("piano", 60), 8: ("celesta", 84), 9: ("glock", 84), 11: ("vibes", 72), 12: ("marimba", 60),
    46: ("harp", 60), 45: ("pizz", 55), 48: ("strings1", 60), 49: ("strings2", 60), 44: ("tremolo", 60),
    40: ("violin", 72), 41: ("viola", 60), 42: ("cello", 43), 43: ("contrabass", 36),
    50: ("synstr1", 60), 51: ("synstr2", 60),
    60: ("horn", 53), 61: ("brass", 55), 57: ("trombone", 48), 68: ("oboe", 67), 71: ("clarinet", 60),
    73: ("flute", 76), 70: ("bassoon", 43), 69: ("eng horn", 60), 52: ("choir aahs", 60), 53: ("voice oohs", 60),
    47: ("timpani", 41), 89: ("warm pad", 60), 91: ("choir pad", 60), 94: ("halo pad", 60), 14: ("tubular", 72),
}


def main():
    ppq = 480
    mid = mido.MidiFile(ticks_per_beat=ppq)
    tr = mido.MidiTrack()
    mid.tracks.append(tr)
    tr.append(mido.MetaMessage("set_tempo", tempo=500000, time=0))  # 1 beat = 0.5 s
    sec = lambda s: int(round(s * 2 * ppq))
    events = []
    slot = 4.0
    for i, (prog, (name, pitch)) in enumerate(PROGS.items()):
        t0 = i * slot
        events.append((t0 - 0.05 if i else 0.0, mido.Message("program_change", channel=0, program=prog)))
        events.append((t0, mido.Message("note_on", channel=0, note=pitch, velocity=96)))
        events.append((t0 + 1.5, mido.Message("note_off", channel=0, note=pitch)))
        events.append((t0 + 2.6, mido.Message("note_on", channel=0, note=pitch, velocity=96)))
        events.append((t0 + 2.72, mido.Message("note_off", channel=0, note=pitch)))
    events.sort(key=lambda e: e[0])
    last = 0
    for t, msg in events:
        tk = sec(t)
        msg.time = tk - last
        last = tk
        tr.append(msg)
    tr.append(mido.MetaMessage("end_of_track", time=sec(2.0)))
    d = tempfile.mkdtemp()
    mp, wp = os.path.join(d, "p.mid"), os.path.join(d, "p.wav")
    mid.save(mp)
    cmd = ["fluidsynth", "-ni", "-F", wp, "-r", "48000", "-g", "0.5", "-R", "0", "-C", "0", "-O", "float", SF2, mp]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(wp):
        print(r.stdout[-800:], r.stderr[-800:])
        sys.exit(1)
    x, sr = sf.read(wp, dtype="float32")
    print("rendered", x.shape, sr, "peak", float(np.abs(x).max()))
    print(f"{'prog':>4} {'name':12} {'pk dB':>6} {'rms dB':>7} {'att10-90 ms':>11} {'t50 ms':>7} {'rel-20dB ms':>11} {'stacc pk dB':>11} {'LRcorr':>6}")
    for i, (prog, (name, pitch)) in enumerate(PROGS.items()):
        a = int(i * slot * sr)
        seg = x[a:a + int(1.5 * sr)]
        env = np.abs(seg).max(axis=1)
        w = int(0.01 * sr)
        envs = np.convolve(env, np.ones(w) / w, mode="same")
        pk = envs.max()
        t10 = np.argmax(envs > 0.1 * pk) / sr * 1000
        t50 = np.argmax(envs > 0.5 * pk) / sr * 1000
        t90 = np.argmax(envs > 0.9 * pk) / sr * 1000
        rel = x[a + int(1.5 * sr):a + int(2.5 * sr)]
        renv = np.convolve(np.abs(rel).max(axis=1), np.ones(w) / w, mode="same")
        lvl_end = envs[-w * 3:-w].mean()
        below = np.nonzero(renv < 0.1 * lvl_end)[0]
        trel = below[0] / sr * 1000 if len(below) else 999
        st = x[a + int(2.6 * sr):a + int(3.4 * sr)]
        c = np.corrcoef(seg[:, 0], seg[:, 1])[0, 1] if seg[:, 0].std() > 0 and seg[:, 1].std() > 0 else 1.0
        print(f"{prog:>4} {name:12} {20 * np.log10(np.abs(seg).max() + 1e-9):6.1f} {20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-9):7.1f} "
              f"{t90 - t10:11.0f} {t50:7.0f} {trel:11.0f} {20 * np.log10(np.abs(st).max() + 1e-9):11.1f} {c:6.2f}")


if __name__ == "__main__":
    main()
