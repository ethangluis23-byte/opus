"""Time each bed generator on its own (no calibration, no cache) and print its band balance."""
import os
import sys
import time

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "audio"))

from lpaudio import registry  # noqa: E402
from lpaudio.dsp import SR, db  # noqa: E402
from lpaudio.dynamics import integrated_lufs  # noqa: E402

EDGES = [0, 125, 250, 500, 1000, 2000, 4000, 8000, 24000]


def bands(x):
    m = x.mean(axis=1)
    P = np.abs(np.fft.rfft(m.astype(np.float64))) ** 2
    f = np.fft.rfftfreq(len(m), 1.0 / SR)
    tot = P.sum() + 1e-30
    return " ".join(f"{int(round(10 * np.log10(P[(f >= a) & (f < b)].sum() / tot + 1e-12))):>4}" for a, b in zip(EDGES[:-1], EDGES[1:]))


def main():
    dur = float(sys.argv[1]) if len(sys.argv) > 1 else 60.0
    only = sys.argv[2] if len(sys.argv) > 2 else ""
    print(f"{'bed':14} {'sec':>6} {'xRT':>6} {'LUFS':>7} {'peak':>6} {'LRcorr':>6}  bands <125 250 500 1k 2k 4k 8k >8k")
    for typ, fn in registry.BEDS.items():
        if only and only not in typ:
            continue
        t0 = time.time()
        x = fn({"dur": dur, "_seed": 1234}, SR)
        el = time.time() - t0
        c = float(np.corrcoef(x[:, 0], x[:, 1])[0, 1])
        print(f"{typ:14} {el:6.2f} {dur / el:6.1f} {integrated_lufs(x):7.1f} {db(np.abs(x).max()):6.1f} {c:6.2f}  {bands(x)}")


if __name__ == "__main__":
    main()
