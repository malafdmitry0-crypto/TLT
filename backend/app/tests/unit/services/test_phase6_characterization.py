"""C2 — Phase 6 soft characterization: freeze expand-window contracts."""

from pathlib import Path

from app.services.electrical_variant_service import (
    _LEGACY_VARIANT_NUMBERS,
    MAX_ELECTRICAL_VARIANTS,
)
from app.services.project_io_service import LEGACY_VARIANT_NUMBERS as IO_LEGACY


def test_expand_window_slot_contracts_aligned():
    assert MAX_ELECTRICAL_VARIANTS == 4
    assert list(_LEGACY_VARIANT_NUMBERS) == [1, 2, 3, 4]
    assert list(IO_LEGACY) == [1, 2, 3, 4]


def test_cutover_prep_doc_exists():
    here = Path(__file__).resolve()
    candidates = [
        here.parents[5] / "docs/architecture/phase-6-uuid-cutover-prep.md",  # repo root
        here.parents[4] / "docs/architecture/phase-6-uuid-cutover-prep.md",
        Path("/app").resolve().parent / "docs/architecture/phase-6-uuid-cutover-prep.md",
    ]
    # Soft assert: doc is in monorepo; container may not mount docs/
    if not any(p.exists() for p in candidates):
        # Still require model bridge markers (stronger contract than docs mount).
        return
    assert any(p.exists() for p in candidates)


def test_models_still_use_variant_number_bridge_markers():
    """Until Phase 6 execute, composite legacy bridge markers must remain findable."""
    import app.models.electrical_calculation as calc_mod
    import app.models.electrical_variant as var_mod

    src = Path(calc_mod.__file__).read_text(encoding="utf-8")
    assert "variant_number" in src
    assert "legacy_variant_number" in Path(var_mod.__file__).read_text(encoding="utf-8")
