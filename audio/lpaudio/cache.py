"""Tiny content-addressed disk cache for rendered audio (.npy, float32)."""
from __future__ import annotations

import hashlib
import json
import os

import numpy as np

_PKG_DIR = os.path.dirname(os.path.abspath(__file__))


def source_hash(*module_files) -> str:
    """Hash of the given source files (names relative to this package), so any
    code change invalidates what was rendered with the old code."""
    h = hashlib.sha256()
    for name in sorted(module_files):
        with open(os.path.join(_PKG_DIR, name), "rb") as f:
            h.update(name.encode())
            h.update(f.read())
    return h.hexdigest()[:16]


def make_key(*parts) -> str:
    s = json.dumps(parts, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(s.encode()).hexdigest()[:20]


class DiskCache:
    def __init__(self, root: str, enabled: bool = True):
        self.root = root
        self.enabled = enabled
        self.hits = 0
        self.misses = 0

    def path(self, group: str, name: str, key: str) -> str:
        return os.path.join(self.root, group, f"{name}_{key}.npy")

    def load(self, group: str, name: str, key: str):
        if not self.enabled:
            return None
        p = self.path(group, name, key)
        if os.path.exists(p):
            try:
                x = np.load(p)
                self.hits += 1
                return x
            except Exception:
                pass
        return None

    def save(self, group: str, name: str, key: str, arr) -> None:
        self.misses += 1
        if not self.enabled:
            return
        p = self.path(group, name, key)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        tmp = p + f".{os.getpid()}.tmp.npy"
        np.save(tmp, np.asarray(arr, dtype=np.float32))
        os.replace(tmp, p)
