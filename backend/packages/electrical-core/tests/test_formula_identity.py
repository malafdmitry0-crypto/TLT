from heatcalc_electrical_core.tt_contract import (
    _FORMULA_CONTRACT,
    ELECTRICAL_TT_FORMULA_FINGERPRINT,
)


def test_formula_fingerprint_matches_current_application_contract() -> None:
    assert _FORMULA_CONTRACT == (
        "case1-r6;P_req=q*K;P_cable=nominal_power;all-full-mark-candidates;"
        "T_product<=T_max;T_env>=T_min;manual-missing-N=1;"
        "sort=N,P_cable,P_cable*N,series(TTN<TTV<TTX),execution(ST<SR),full_mark;"
        "execution-source-warning;user-U-downstream;"
        "winding-pitch;Idop=project-setting??Lmax*Ist_ud;equal-sections;"
        "Lfact-totals;order=ceil(Lfact*1.10,0.001)"
    )
    assert (
        ELECTRICAL_TT_FORMULA_FINGERPRINT
        == "sha256:b5a3cf8afff840e8fb5dabb7d09fd183cccb036439e5b41406b12ef26d06a2f4"
    )
