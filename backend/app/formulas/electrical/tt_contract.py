"""Version identity for the canonical ТТН/ТТВ/ТТХ calculation contract."""

from __future__ import annotations

import hashlib

ELECTRICAL_TT_FORMULA_VERSION = "electrical-tt-v2"
SYSTEM_VOLTAGE_V = 230

_FORMULA_CONTRACT = (
    "T1/T2-strict;q1*T3+q2;technical-minimum;threads=1..3;"
    "U=230;winding-pitch;equal-sections;Lfact-totals;order=ceil(Lfact*1.10,0.001)"
)

ELECTRICAL_TT_FORMULA_FINGERPRINT = (
    "sha256:" + hashlib.sha256(_FORMULA_CONTRACT.encode("utf-8")).hexdigest()
)
