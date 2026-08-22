from uuid import uuid4

from app.contracts import (
    CableSource,
    CableType,
    CalcId,
    Installation,
    ObjectId,
    PipeMaterial,
    ProjectId,
    SessionId,
    TankShape,
    UserId,
)


def test_id_contracts_are_runtime_transparent_aliases():
    project_id = uuid4()
    object_id = uuid4()
    user_id = uuid4()
    calc_id = uuid4()

    assert ProjectId(project_id) == project_id
    assert ObjectId(object_id) == object_id
    assert UserId(user_id) == user_id
    assert CalcId(calc_id) == calc_id
    assert SessionId("guest-token") == "guest-token"


def test_string_enums_use_persisted_values():
    assert [item.value for item in CableType] == [
        "self_regulating",
        "single_core",
        "three_core",
    ]
    assert [item.value for item in Installation] == ["indoor", "outdoor"]
    assert [item.value for item in TankShape] == ["cylindrical", "rectangular"]
    assert [item.value for item in PipeMaterial] == [
        "carbon_steel",
        "stainless_304",
        "copper",
        "aluminum",
        "plastic",
    ]
    assert [item.value for item in CableSource] == ["builtin", "extended", "all"]
