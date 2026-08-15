"""Version identity for the canonical ТТН/ТТВ/ТТХ calculation contract."""

from __future__ import annotations

import hashlib

ELECTRICAL_TT_FORMULA_VERSION = "electrical-tt-v3-case1-r5"

_FORMULA_CONTRACT = (
    "case1-r5;P_req=q*K;P_cable=nominal_power;all-full-mark-candidates;"
    "T_product<=T_max;T_env>=T_min;manual-missing-N=1;"
    "sort=N,P_cable,P_cable*N,full_mark;user-U-downstream;"
    "winding-pitch;Idop=project-setting??Lmax*Ist_ud;equal-sections;"
    "Lfact-totals;order=ceil(Lfact*1.10,0.001)"
)

ELECTRICAL_TT_FORMULA_FINGERPRINT = (
    "sha256:" + hashlib.sha256(_FORMULA_CONTRACT.encode("utf-8")).hexdigest()
)
