"""Заполнение базы тестовыми данными.

Запуск:
    python -m app.seeds

Идемпотентный: повторный запуск не создаёт дублей.

Порядок выполнения:
  1. users (admin2 + 5 employees)
  2. correction_coefficients (расчётные и demo commercial политики)
  3. insulation_materials (DB projection встроенного JSON-справочника)
  4. cables_extended (встроенный технический каталог + demo commercial projection)
  5. accessories_extended (demo accessory cost layer)
  6. projects (10 проектов, привязаны к employees)
  7. project_objects — только pipe/tank, с конкретными материалами изоляции
  8. electrical_calculations — для каждого pipe-объекта
  9. specifications — для каждого проекта с электрорасчётом
"""

import asyncio
import logging
import re
import uuid
from datetime import UTC, datetime

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.formulas.electrical.self_regulating import calc_self_regulating
from app.formulas.heat_loss.pipe import calc_pipe_heat_loss
from app.formulas.heat_loss.tank import calc_tank_heat_loss
from app.formulas.specification.builder import build_basic_specification
from app.models.accessory import AccessoryExtended
from app.models.cable import CableExtended
from app.models.coefficient import CorrectionCoefficient
from app.models.electrical_calculation import ElectricalCalculation
from app.models.insulation_material import InsulationMaterial
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.models.specification import Specification
from app.models.user import User
from app.reference_data.loader import (
    list_insulation_materials,
    list_resistive_cables,
    list_tlt_cables,
)
from app.schemas.calculation import (
    RESISTIVE_DEFAULT_MIN_ADJUSTED_VOLTAGE,
    RESISTIVE_DEFAULT_VOLTAGE_STEP,
    PipeHeatLossParams,
    SelfRegulatingParams,
    TankHeatLossParams,
)

logger = logging.getLogger("seeds")
logging.basicConfig(level=logging.INFO, format="%(message)s")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_or_create_user(db, email: str, **kwargs) -> User:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(email=email, **kwargs)
        db.add(user)
        logger.info("  + user %s (%s)", email, kwargs.get("role"))
    return user


def _get_coefficients_dict(coeffs: list[CorrectionCoefficient]) -> dict[str, float]:
    return {c.key: c.value for c in coeffs}


_DEMO_COMMERCIAL_SOURCES = {None, "seed", "demo_seed", "test", "e2e"}
_REFERENCE_SEED_SOURCES = {None, "builtin_json", "seed", "demo_seed", "test"}
_SELF_REG_ACCESSORY_COST_PER_CIRCUIT = 2400.0
_RESISTIVE_ACCESSORY_COST_PER_CIRCUIT = 3200.0


def _article(model: str) -> str:
    safe = (
        model.upper()
        .replace(" ", "-")
        .replace(",", ".")
        .replace("/", "-")
        .replace("Х", "X")
        .replace("×", "X")
    )
    return f"DEMO-{safe}"


def _stock_status(stock_quantity_m: float) -> str:
    if stock_quantity_m >= 500:
        return "in_stock"
    if stock_quantity_m > 0:
        return "limited"
    return "unknown"


def _with_commercial_params(
    params: dict[str, object] | None,
    *,
    accessory_cost_per_circuit: float,
) -> dict[str, object]:
    merged: dict[str, object] = dict(params or {})
    commercial = merged.get("commercial")
    commercial_dict = dict(commercial) if isinstance(commercial, dict) else {}
    commercial_dict.setdefault("accessory_cost_per_circuit", accessory_cost_per_circuit)
    commercial_dict.setdefault("accessory_cost_scope", "demo_per_circuit")
    commercial_dict.setdefault("accessory_cost_source", "demo_seed")
    merged["commercial"] = commercial_dict
    return merged


def _commercial_seed_is_allowed(existing: CableExtended) -> bool:
    if existing.commercial_data_source in _DEMO_COMMERCIAL_SOURCES:
        return True
    commercial_values = (
        existing.price_per_meter,
        existing.stock_quantity_m,
        existing.lead_time_days,
        existing.supplier_priority,
        existing.supplier_name,
        existing.article,
    )
    return all(value in (None, "") for value in commercial_values) and not existing.is_preferred


def _apply_demo_commercial(existing: CableExtended, data: dict[str, object]) -> None:
    """Updates seed/demo-managed rows, but leaves real production data alone."""
    if _commercial_seed_is_allowed(existing):
        update_keys = (
            "power_per_meter",
            "max_temperature",
            "min_temperature",
            "resistance_per_meter",
            "is_active",
            "params",
            "supplier_name",
            "article",
            "currency",
            "price_per_meter",
            "stock_quantity_m",
            "stock_status",
            "lead_time_days",
            "supplier_priority",
            "is_preferred",
            "order_multiple_m",
            "min_order_quantity_m",
            "is_discontinued",
            "replacement_group",
            "price_updated_at",
            "stock_updated_at",
            "commercial_data_source",
        )
    else:
        update_keys = ()
    for key in update_keys:
        if key in data:
            setattr(existing, key, data[key])


async def _upsert_demo_cable(db, data: dict[str, object]) -> None:
    result = await db.execute(
        select(CableExtended).where(
            CableExtended.model == data["model"],
            CableExtended.brand == data["brand"],
            CableExtended.cable_type == data["cable_type"],
        )
    )
    existing = result.scalar_one_or_none()
    if existing is None:
        db.add(CableExtended(**data))
        logger.info("  + demo cable %s %s", data["brand"], data["model"])
        return
    _apply_demo_commercial(existing, data)
    logger.info("  ~ demo cable commercial %s %s", data["brand"], data["model"])


def _tlt_demo_cable(cable: dict[str, object], index: int, now: datetime) -> dict[str, object]:
    power = float(cable["power_per_meter"])
    price_per_meter = 260.0 + power * 8.5
    stock_quantity_m = max(180.0, 1600.0 - index * 115.0)
    return {
        "cable_type": "self_regulating",
        "brand": str(cable.get("brand") or "ТЛТ"),
        "model": str(cable["model"]),
        "power_per_meter": power,
        "max_temperature": float(cable["max_temperature"]),
        "min_temperature": float(cable["min_temperature"]),
        "resistance_per_meter": None,
        "supplier_name": "Demo ТЛТ Supply",
        "article": _article(str(cable["model"])),
        "currency": "RUB",
        "price_per_meter": round(price_per_meter, 2),
        "stock_quantity_m": round(stock_quantity_m, 2),
        "stock_status": _stock_status(stock_quantity_m),
        "lead_time_days": 2 + index // 3,
        "supplier_priority": 10 + index,
        "is_preferred": index == 0,
        "order_multiple_m": 1.0,
        "min_order_quantity_m": 0.0,
        "is_discontinued": False,
        "replacement_group": "ТЛТ",
        "price_updated_at": now,
        "stock_updated_at": now,
        "commercial_data_source": "demo_seed",
        "params": _with_commercial_params(
            {
                "voltage": cable.get("voltage", 220),
                "protection": "IP67",
            },
            accessory_cost_per_circuit=_SELF_REG_ACCESSORY_COST_PER_CIRCUIT,
        ),
        "is_active": True,
    }


def _resistive_demo_cable(
    cable: dict[str, object],
    *,
    cable_type: str,
    index: int,
    now: datetime,
) -> dict[str, object]:
    section = _resistive_section(cable)
    resistance_ohm_km = float(cable.get("resistance_ohm_km") or (17.5 / section))
    price_per_meter = 95.0 + section * 22.0 + max(0.0, 900.0 - resistance_ohm_km) * 0.018
    stock_quantity_m = max(120.0, 2400.0 - index * 38.0)
    brand = str(cable.get("brand") or ("ТТ Р1" if cable_type == "single_core" else "ТТ Р3"))
    params = {
        "resistance_ohm_km": resistance_ohm_km,
        "conductor_section_mm2": section,
        "diameter_mm": cable.get("diameter_mm"),
        "nominal_section_length_m": cable.get("nominal_section_length_m"),
        "nominal_size_mm": cable.get("nominal_size_mm"),
        "mass_kg_km": cable.get("mass_kg_km"),
        "min_bend_radius_mm": cable.get("min_bend_radius_mm"),
        "source": cable.get("source"),
    }
    return {
        "cable_type": cable_type,
        "brand": brand,
        "model": str(cable["model"]),
        "power_per_meter": None,
        "max_temperature": 130.0,
        "min_temperature": -60.0,
        "resistance_per_meter": resistance_ohm_km / 1000.0,
        "supplier_name": "Demo ТТ Supply",
        "article": _article(str(cable["model"])),
        "currency": "RUB",
        "price_per_meter": round(price_per_meter, 2),
        "stock_quantity_m": round(stock_quantity_m, 2),
        "stock_status": _stock_status(stock_quantity_m),
        "lead_time_days": 3 + min(index // 10, 7),
        "supplier_priority": 20 + index,
        "is_preferred": index == 0,
        "order_multiple_m": 10.0,
        "min_order_quantity_m": 10.0,
        "is_discontinued": False,
        "replacement_group": brand,
        "price_updated_at": now,
        "stock_updated_at": now,
        "commercial_data_source": "demo_seed",
        "params": _with_commercial_params(
            params,
            accessory_cost_per_circuit=_RESISTIVE_ACCESSORY_COST_PER_CIRCUIT,
        ),
        "is_active": True,
    }


def _resistive_section(cable: dict[str, object]) -> float:
    raw = cable.get("conductor_section_mm2") or cable.get("conductor_cross_section")
    if raw is not None:
        return float(raw)
    match = re.search(r"х\s*(\d+(?:[,.]\d+)?)\s*-", str(cable.get("model", "")))
    if match:
        return float(match.group(1).replace(",", "."))
    raise ValueError(f"Не удалось определить сечение для {cable.get('model')}")


def _seed_params_are_current(
    existing_params: dict[str, object] | None,
    expected_params: dict[str, object],
) -> bool:
    """Checks whether an existing demo object already matches current seed params."""
    return existing_params == expected_params


def _insulation_seed_row(entry: dict[str, object]) -> dict[str, object]:
    column_keys = {
        "material",
        "name",
        "conductivity",
        "density_kg_m3",
        "temperature_range",
        "conductivity_20_plus",
        "conductivity_19_minus",
        "selectable",
        "deprecated",
        "requires_material_reselection",
        "material_family",
        "reselection_message",
        "source",
    }
    params = {key: value for key, value in entry.items() if key not in column_keys}
    return {
        "material": str(entry["material"]),
        "name": str(entry["name"]),
        "conductivity": entry.get("conductivity"),
        "density_kg_m3": entry.get("density_kg_m3"),
        "temperature_range": entry.get("temperature_range"),
        "conductivity_20_plus": entry.get("conductivity_20_plus"),
        "conductivity_19_minus": entry.get("conductivity_19_minus"),
        "selectable": entry.get("selectable") is not False,
        "deprecated": entry.get("deprecated") is True,
        "requires_material_reselection": entry.get("requires_material_reselection") is True,
        "material_family": entry.get("material_family"),
        "reselection_message": entry.get("reselection_message"),
        "source": entry.get("source"),
        "data_source": "builtin_json",
        "params": params,
        "is_active": True,
    }


async def seed_demo_commercial_catalog(db) -> None:
    """Заполняет DB commercial projection для встроенных ТЛТ/ТТ Р1/ТТ Р3 справочников.

    Значения намеренно помечены `commercial_data_source=demo_seed`: это тестовые
    цены/остатки для dev/e2e. Production должен заменить их реальным импортом
    или ручным вводом, а повторный seed не перезапишет строки с другим source.
    """
    now = datetime.now(UTC)
    for index, cable in enumerate(list_tlt_cables()):
        await _upsert_demo_cable(db, _tlt_demo_cable(cable, index, now))

    resistive_catalog = list_resistive_cables()
    for index, cable in enumerate(resistive_catalog.get("single_core", [])):
        await _upsert_demo_cable(
            db,
            _resistive_demo_cable(cable, cable_type="single_core", index=index, now=now),
        )
    for index, cable in enumerate(resistive_catalog.get("three_core", [])):
        await _upsert_demo_cable(
            db,
            _resistive_demo_cable(cable, cable_type="three_core", index=index, now=now),
        )


# ---------------------------------------------------------------------------
# Seed functions
# ---------------------------------------------------------------------------


async def seed_users(db) -> list[User]:
    users_data = [
        dict(
            email="admin2@heatcalc.io",
            hashed_password=hash_password("Admin2pass!"),
            full_name="Иванов Сергей Петрович",
            role="admin",
            is_active=True,
        ),
        dict(
            email="petrov@heatcalc.io",
            hashed_password=hash_password("Employee1!"),
            full_name="Петров Андрей Владимирович",
            role="employee",
            is_active=True,
        ),
        dict(
            email="sidorova@heatcalc.io",
            hashed_password=hash_password("Employee2!"),
            full_name="Сидорова Елена Юрьевна",
            role="employee",
            is_active=True,
        ),
        dict(
            email="kuznetsov@heatcalc.io",
            hashed_password=hash_password("Employee3!"),
            full_name="Кузнецов Дмитрий Алексеевич",
            role="employee",
            is_active=True,
        ),
        dict(
            email="morozova@heatcalc.io",
            hashed_password=hash_password("Employee4!"),
            full_name="Морозова Наталья Ивановна",
            role="employee",
            is_active=True,
        ),
        dict(
            email="volkov@heatcalc.io",
            hashed_password=hash_password("Employee5!"),
            full_name="Волков Павел Сергеевич",
            role="employee",
            is_active=True,
        ),
    ]
    users = []
    for data in users_data:
        email = data.pop("email")
        user = await _get_or_create_user(db, email, **data)
        users.append(user)
    await db.flush()
    return users


async def seed_coefficients(db, admin_id: uuid.UUID) -> list[CorrectionCoefficient]:
    from app.core.cache import cache

    coefficients = [
        dict(
            key="wind_factor", value=1.0, description="Поправочный коэффициент на скорость ветра."
        ),
        dict(
            key="safety_factor",
            value=1.1,
            description="Коэффициент запаса К для расчёта теплопотерь трубопровода.",
        ),
        dict(
            key="location_indoor",
            value=0.9,
            description="Понижающий коэффициент для объектов внутри помещения.",
        ),
        dict(
            key="location_outdoor",
            value=1.0,
            description="Коэффициент для объектов на открытом воздухе.",
        ),
        dict(
            key="ground_conductivity",
            value=1.5,
            description="Теплопроводность грунта λ_гр, Вт/(м·К).",
        ),
        dict(
            key="commercial_balanced_weight_cost",
            value=0.45,
            description="Demo/test weight for balanced commercial ranking cost component.",
        ),
        dict(
            key="commercial_balanced_weight_delivery",
            value=0.25,
            description="Demo/test weight for balanced commercial ranking delivery component.",
        ),
        dict(
            key="commercial_balanced_weight_stock",
            value=0.2,
            description="Demo/test weight for balanced commercial ranking stock component.",
        ),
        dict(
            key="commercial_balanced_weight_supplier",
            value=0.1,
            description="Demo/test weight for balanced commercial ranking supplier component.",
        ),
        dict(
            key="commercial_balanced_weights_approved",
            value=1.0,
            description=(
                "Demo/test approval flag for balanced commercial ranking. "
                "Production must replace with approved business value."
            ),
        ),
        dict(
            key="commercial_accessory_cost_per_circuit_self_regulating",
            value=_SELF_REG_ACCESSORY_COST_PER_CIRCUIT,
            description=(
                "Demo/test accessory cost per self-regulating circuit, RUB. "
                "Copied into demo cable commercial params."
            ),
        ),
        dict(
            key="commercial_accessory_cost_per_circuit_resistive",
            value=_RESISTIVE_ACCESSORY_COST_PER_CIRCUIT,
            description=(
                "Demo/test accessory cost per resistive circuit, RUB. "
                "Copied into demo cable commercial params."
            ),
        ),
        dict(
            key="resistive_start_voltage_v",
            value=220.0,
            description="Demo/test default starting voltage for resistive auto-selection.",
        ),
        dict(
            key="resistive_high_voltage_v",
            value=380.0,
            description="Demo/test high-voltage step for resistive auto-selection.",
        ),
        dict(
            key="resistive_min_adjusted_voltage_v",
            value=RESISTIVE_DEFAULT_MIN_ADJUSTED_VOLTAGE,
            description=(
                "Safety floor for resistive auto-selection voltage step-down, V. "
                "Override only with an engineering-reviewed policy."
            ),
        ),
        dict(
            key="resistive_voltage_step_v",
            value=RESISTIVE_DEFAULT_VOLTAGE_STEP,
            description=(
                "Safety fallback voltage decrement step for resistive auto-selection, V. "
                "Override with 1 V only after engineering review."
            ),
        ),
        dict(
            key="resistive_max_current_a",
            value=65.0,
            description="ТТ Р1/ТТ Р3 current limit from parsed documentation, A.",
        ),
        dict(
            key="resistive_max_linear_power_w_m",
            value=40.0,
            description="ТТ Р1/ТТ Р3 max nominal linear power from parsed 20/30/40 W/m tables.",
        ),
        dict(
            key="resistive_max_parallel_schemes",
            value=20.0,
            description="Demo/test maximum parallel schemes for full-version resistive auto-selection.",
        ),
        dict(
            key="resistive_max_conductor_temperature",
            value=130.0,
            description="ТТ Р1/ТТ Р3 max temperature under load from latest screenshot, °C.",
        ),
    ]
    created = []
    for data in coefficients:
        result = await db.execute(
            select(CorrectionCoefficient).where(CorrectionCoefficient.key == data["key"])
        )
        coeff = result.scalar_one_or_none()
        if coeff is None:
            coeff = CorrectionCoefficient(**data, updated_by=admin_id)
            db.add(coeff)
            logger.info("  + coefficient %s = %s", data["key"], data["value"])
        elif str(data["key"]).startswith(("commercial_", "resistive_")):
            coeff.value = data["value"]
            coeff.description = data["description"]
            coeff.updated_by = admin_id
            logger.info("  ~ coefficient %s = %s", data["key"], data["value"])
        created.append(coeff)
    await db.flush()
    await cache.ainvalidate("coefficients")
    return created


async def seed_insulation_materials(db) -> None:
    """Syncs runtime DB insulation catalog from versioned reference JSON.

    Rows seeded from JSON are managed by `data_source=builtin_json`. Production
    rows with another source are left untouched, so real DB data can coexist
    with the built-in catalog without being overwritten by app startup seeds.
    """
    from app.core.cache import cache

    current_materials: set[str] = set()
    for entry in list_insulation_materials():
        data = _insulation_seed_row(entry)
        material = str(data["material"])
        current_materials.add(material)
        result = await db.execute(
            select(InsulationMaterial).where(InsulationMaterial.material == material)
        )
        existing = result.scalar_one_or_none()
        if existing is None:
            db.add(InsulationMaterial(**data))
            logger.info("  + insulation material %s", material)
            continue
        if existing.data_source not in _REFERENCE_SEED_SOURCES:
            logger.info(
                "  ~ keep insulation material %s from source=%s",
                material,
                existing.data_source,
            )
            continue
        for key, value in data.items():
            setattr(existing, key, value)
        logger.info("  ~ insulation material %s", material)

    result = await db.execute(
        select(InsulationMaterial).where(InsulationMaterial.data_source == "builtin_json")
    )
    for existing in result.scalars().all():
        if existing.material not in current_materials and existing.is_active:
            existing.is_active = False
            logger.info("  - deactivate insulation material %s", existing.material)

    await db.flush()
    await cache.ainvalidate("references:insulation")
    await cache.ainvalidate("references:internal")


def _commercial(
    *,
    price_per_meter: float,
    stock_quantity_m: float,
    lead_time_days: int,
    supplier_priority: int,
    is_preferred: bool = False,
    order_multiple_m: float = 1.0,
    min_order_quantity_m: float = 0.0,
    supplier_name: str = "ТЛТ",
    currency: str = "RUB",
) -> dict[str, object]:
    now = datetime.now(UTC)
    return {
        "supplier_name": supplier_name,
        "article": None,
        "currency": currency,
        "price_per_meter": price_per_meter,
        "stock_quantity_m": stock_quantity_m,
        "stock_status": "in_stock" if stock_quantity_m > 0 else "unknown",
        "lead_time_days": lead_time_days,
        "supplier_priority": supplier_priority,
        "is_preferred": is_preferred,
        "order_multiple_m": order_multiple_m,
        "min_order_quantity_m": min_order_quantity_m,
        "is_discontinued": False,
        "replacement_group": None,
        "price_updated_at": now,
        "stock_updated_at": now,
        "commercial_data_source": "seed",
    }


def _accessory_params(base: dict[str, object], *, price_rub: float) -> dict[str, object]:
    return {
        **base,
        "price": price_rub,
        "currency": "RUB",
        "commercial_data_source": "demo_seed",
    }


async def seed_cables(db) -> None:
    cables_data = [
        # self_regulating — саморегулирующиеся
        dict(
            cable_type="self_regulating",
            brand="ТЛТ",
            model="ТЛТ-10",
            power_per_meter=10.0,
            max_temperature=65.0,
            min_temperature=-60.0,
            resistance_per_meter=None,
            params={"voltage": 230, "protection": "IP67"},
            **_commercial(
                price_per_meter=320.0,
                stock_quantity_m=1200.0,
                lead_time_days=2,
                supplier_priority=10,
                is_preferred=True,
                order_multiple_m=1.0,
            ),
        ),
        dict(
            cable_type="self_regulating",
            brand="ТЛТ",
            model="ТЛТ-15",
            power_per_meter=15.0,
            max_temperature=65.0,
            min_temperature=-60.0,
            resistance_per_meter=None,
            params={"voltage": 230, "protection": "IP67"},
            **_commercial(
                price_per_meter=380.0,
                stock_quantity_m=900.0,
                lead_time_days=3,
                supplier_priority=15,
                order_multiple_m=1.0,
            ),
        ),
        dict(
            cable_type="self_regulating",
            brand="ТЛТ",
            model="ТЛТ-25",
            power_per_meter=25.0,
            max_temperature=65.0,
            min_temperature=-60.0,
            resistance_per_meter=None,
            params={"voltage": 230, "protection": "IP67"},
            **_commercial(
                price_per_meter=460.0,
                stock_quantity_m=750.0,
                lead_time_days=3,
                supplier_priority=20,
                order_multiple_m=1.0,
            ),
        ),
        # external-only self_regulating — уникальные внешние позиции для UX/source-тестов
        dict(
            cable_type="self_regulating",
            brand="ВНШ-СР",
            model="ВНШ-СР-18",
            power_per_meter=18.0,
            max_temperature=90.0,
            min_temperature=-55.0,
            resistance_per_meter=None,
            params={
                "voltage": 220,
                "protection": "IP68",
                "external_seed_kind": "unique_technical",
            },
            **_commercial(
                price_per_meter=515.0,
                stock_quantity_m=640.0,
                lead_time_days=4,
                supplier_priority=18,
                order_multiple_m=1.0,
                supplier_name="Demo External Cable Supply",
            ),
        ),
        dict(
            cable_type="self_regulating",
            brand="ВНШ-СР",
            model="ВНШ-СР-33",
            power_per_meter=33.0,
            max_temperature=110.0,
            min_temperature=-55.0,
            resistance_per_meter=None,
            params={
                "voltage": 220,
                "protection": "IP68",
                "external_seed_kind": "unique_technical",
            },
            **_commercial(
                price_per_meter=690.0,
                stock_quantity_m=520.0,
                lead_time_days=5,
                supplier_priority=19,
                order_multiple_m=1.0,
                supplier_name="Demo External Cable Supply",
            ),
        ),
        dict(
            cable_type="self_regulating",
            brand="ВНШ-СР",
            model="ВНШ-СР-125HT",
            power_per_meter=125.0,
            max_temperature=180.0,
            min_temperature=-60.0,
            resistance_per_meter=None,
            params={
                "voltage": 220,
                "protection": "IP68",
                "external_seed_kind": "unique_technical",
                "max_pipe_temp": 160,
            },
            **_commercial(
                price_per_meter=1480.0,
                stock_quantity_m=260.0,
                lead_time_days=9,
                supplier_priority=24,
                order_multiple_m=1.0,
                supplier_name="Demo External Cable Supply",
            ),
        ),
        # single_core — одножильные резистивные
        dict(
            cable_type="single_core",
            brand="СНТО",
            model="СНТО-10/220",
            power_per_meter=10.0,
            max_temperature=80.0,
            min_temperature=-55.0,
            resistance_per_meter=22.0,
            params={"voltage": 220, "conductor_section_mm2": 1.5},
            **_commercial(
                price_per_meter=210.0,
                stock_quantity_m=2000.0,
                lead_time_days=1,
                supplier_priority=12,
                is_preferred=True,
                order_multiple_m=10.0,
            ),
        ),
        dict(
            cable_type="single_core",
            brand="СНТО",
            model="СНТО-20/220",
            power_per_meter=20.0,
            max_temperature=80.0,
            min_temperature=-55.0,
            resistance_per_meter=11.0,
            params={"voltage": 220, "conductor_section_mm2": 2.5},
            **_commercial(
                price_per_meter=260.0,
                stock_quantity_m=1600.0,
                lead_time_days=2,
                supplier_priority=18,
                order_multiple_m=10.0,
            ),
        ),
        dict(
            cable_type="single_core",
            brand="СНТО",
            model="СНТО-30/380",
            power_per_meter=30.0,
            max_temperature=80.0,
            min_temperature=-55.0,
            resistance_per_meter=14.2,
            params={"voltage": 380, "conductor_section_mm2": 2.5},
            **_commercial(
                price_per_meter=290.0,
                stock_quantity_m=1100.0,
                lead_time_days=4,
                supplier_priority=25,
                order_multiple_m=10.0,
            ),
        ),
        # external-only single_core — уникальные внешние позиции для UX/source-тестов
        dict(
            cable_type="single_core",
            brand="ВНШ-Р1",
            model="ВНШ-Р1-1.8/230",
            power_per_meter=18.0,
            max_temperature=130.0,
            min_temperature=-60.0,
            resistance_per_meter=0.018,
            params={
                "voltage": 230,
                "conductor_section_mm2": 1.8,
                "diameter_mm": 4.6,
                "external_seed_kind": "unique_technical",
            },
            **_commercial(
                price_per_meter=295.0,
                stock_quantity_m=1400.0,
                lead_time_days=3,
                supplier_priority=22,
                order_multiple_m=10.0,
                supplier_name="Demo External Cable Supply",
            ),
        ),
        dict(
            cable_type="single_core",
            brand="ВНШ-Р1",
            model="ВНШ-Р1-3.2/400",
            power_per_meter=36.0,
            max_temperature=155.0,
            min_temperature=-60.0,
            resistance_per_meter=0.032,
            params={
                "voltage": 400,
                "conductor_section_mm2": 3.2,
                "diameter_mm": 5.4,
                "external_seed_kind": "unique_technical",
            },
            **_commercial(
                price_per_meter=365.0,
                stock_quantity_m=960.0,
                lead_time_days=5,
                supplier_priority=27,
                order_multiple_m=10.0,
                supplier_name="Demo External Cable Supply",
            ),
        ),
        # three_core — трёхжильные резистивные
        dict(
            cable_type="three_core",
            brand="КМСО",
            model="КМСО-1,0-15",
            power_per_meter=15.0,
            max_temperature=90.0,
            min_temperature=-60.0,
            resistance_per_meter=18.0,
            params={"voltage": 220, "conductor_section_mm2": 1.0},
            **_commercial(
                price_per_meter=340.0,
                stock_quantity_m=900.0,
                lead_time_days=4,
                supplier_priority=30,
                order_multiple_m=10.0,
            ),
        ),
        dict(
            cable_type="three_core",
            brand="КМСО",
            model="КМСО-1,5-25",
            power_per_meter=25.0,
            max_temperature=90.0,
            min_temperature=-60.0,
            resistance_per_meter=12.5,
            params={"voltage": 220, "conductor_section_mm2": 1.5},
            **_commercial(
                price_per_meter=390.0,
                stock_quantity_m=850.0,
                lead_time_days=5,
                supplier_priority=35,
                order_multiple_m=10.0,
            ),
        ),
        dict(
            cable_type="three_core",
            brand="КМСО",
            model="КМСО-2,5-40",
            power_per_meter=40.0,
            max_temperature=90.0,
            min_temperature=-60.0,
            resistance_per_meter=7.4,
            params={"voltage": 380, "conductor_section_mm2": 2.5},
            **_commercial(
                price_per_meter=480.0,
                stock_quantity_m=600.0,
                lead_time_days=6,
                supplier_priority=40,
                order_multiple_m=10.0,
            ),
        ),
        # external-only three_core — уникальные внешние позиции для UX/source-тестов
        dict(
            cable_type="three_core",
            brand="ВНШ-Р3",
            model="ВНШ-Р3-4.0-55",
            power_per_meter=55.0,
            max_temperature=140.0,
            min_temperature=-60.0,
            resistance_per_meter=0.0066,
            params={
                "voltage": 400,
                "conductor_section_mm2": 4.0,
                "nominal_size_mm": "3×4.0",
                "diameter_mm": 9.8,
                "external_seed_kind": "unique_technical",
            },
            **_commercial(
                price_per_meter=620.0,
                stock_quantity_m=720.0,
                lead_time_days=7,
                supplier_priority=38,
                order_multiple_m=10.0,
                supplier_name="Demo External Cable Supply",
            ),
        ),
        dict(
            cable_type="three_core",
            brand="ВНШ-Р3",
            model="ВНШ-Р3-6.0-78",
            power_per_meter=78.0,
            max_temperature=155.0,
            min_temperature=-60.0,
            resistance_per_meter=0.0044,
            params={
                "voltage": 400,
                "conductor_section_mm2": 6.0,
                "nominal_size_mm": "3×6.0",
                "diameter_mm": 11.6,
                "external_seed_kind": "unique_technical",
            },
            **_commercial(
                price_per_meter=790.0,
                stock_quantity_m=520.0,
                lead_time_days=10,
                supplier_priority=43,
                order_multiple_m=10.0,
                supplier_name="Demo External Cable Supply",
            ),
        ),
        # mineral — кабели с минеральной изоляцией
        dict(
            cable_type="mineral",
            brand="МИМС",
            model="МИМС-1Ж-1.5/220",
            power_per_meter=15.0,
            max_temperature=250.0,
            min_temperature=-60.0,
            resistance_per_meter=None,
            params={"voltage": 220, "max_pipe_temp": 200},
            **_commercial(
                price_per_meter=1250.0,
                stock_quantity_m=300.0,
                lead_time_days=14,
                supplier_priority=60,
                order_multiple_m=5.0,
            ),
        ),
        dict(
            cable_type="mineral",
            brand="МИМС",
            model="МИМС-2Ж-1.5/220",
            power_per_meter=30.0,
            max_temperature=250.0,
            min_temperature=-60.0,
            resistance_per_meter=None,
            params={"voltage": 220, "max_pipe_temp": 200},
            **_commercial(
                price_per_meter=1450.0,
                stock_quantity_m=220.0,
                lead_time_days=21,
                supplier_priority=65,
                order_multiple_m=5.0,
            ),
        ),
        dict(
            cable_type="mineral",
            brand="МИМС",
            model="МИМС-1Ж-2.5/380",
            power_per_meter=40.0,
            max_temperature=250.0,
            min_temperature=-60.0,
            resistance_per_meter=None,
            params={"voltage": 380, "max_pipe_temp": 200},
            **_commercial(
                price_per_meter=1680.0,
                stock_quantity_m=180.0,
                lead_time_days=21,
                supplier_priority=70,
                order_multiple_m=5.0,
            ),
        ),
        # external-only mineral — уникальные внешние позиции для UX/source-тестов
        dict(
            cable_type="mineral",
            brand="ВНШ-МИ",
            model="ВНШ-МИ-2Ж-3.0/400",
            power_per_meter=52.0,
            max_temperature=320.0,
            min_temperature=-70.0,
            resistance_per_meter=None,
            params={
                "voltage": 400,
                "max_pipe_temp": 280,
                "nominal_size_mm": "2×3.0",
                "external_seed_kind": "unique_technical",
            },
            **_commercial(
                price_per_meter=2150.0,
                stock_quantity_m=120.0,
                lead_time_days=18,
                supplier_priority=68,
                order_multiple_m=5.0,
                supplier_name="Demo External Cable Supply",
            ),
        ),
        # skin — кабели скин-эффекта
        dict(
            cable_type="skin",
            brand="СКЭ",
            model="СКЭ-25-1",
            power_per_meter=25.0,
            max_temperature=120.0,
            min_temperature=-60.0,
            resistance_per_meter=None,
            params={"voltage": 220, "max_length": 2000},
            **_commercial(
                price_per_meter=2100.0,
                stock_quantity_m=120.0,
                lead_time_days=30,
                supplier_priority=80,
                order_multiple_m=50.0,
            ),
        ),
        dict(
            cable_type="skin",
            brand="СКЭ",
            model="СКЭ-40-1",
            power_per_meter=40.0,
            max_temperature=120.0,
            min_temperature=-60.0,
            resistance_per_meter=None,
            params={"voltage": 220, "max_length": 3000},
            **_commercial(
                price_per_meter=2450.0,
                stock_quantity_m=100.0,
                lead_time_days=35,
                supplier_priority=85,
                order_multiple_m=50.0,
            ),
        ),
        dict(
            cable_type="skin",
            brand="СКЭ",
            model="СКЭ-60-3",
            power_per_meter=60.0,
            max_temperature=120.0,
            min_temperature=-60.0,
            resistance_per_meter=None,
            params={"voltage": 380, "max_length": 5000},
            **_commercial(
                price_per_meter=2950.0,
                stock_quantity_m=80.0,
                lead_time_days=45,
                supplier_priority=90,
                order_multiple_m=50.0,
            ),
        ),
        # external-only skin — уникальные внешние позиции для UX/source-тестов
        dict(
            cable_type="skin",
            brand="ВНШ-СК",
            model="ВНШ-СК-75-5",
            power_per_meter=75.0,
            max_temperature=160.0,
            min_temperature=-70.0,
            resistance_per_meter=None,
            params={
                "voltage": 500,
                "max_length": 6500,
                "external_seed_kind": "unique_technical",
            },
            **_commercial(
                price_per_meter=3450.0,
                stock_quantity_m=70.0,
                lead_time_days=40,
                supplier_priority=88,
                order_multiple_m=50.0,
                supplier_name="Demo External Cable Supply",
            ),
        ),
    ]
    for data in cables_data:
        result = await db.execute(
            select(CableExtended).where(
                CableExtended.model == data["model"],
                CableExtended.brand == data["brand"],
            )
        )
        existing = result.scalar_one_or_none()
        if existing is None:
            db.add(CableExtended(**data))
            logger.info("  + cable %s %s", data["brand"], data["model"])
        elif existing.price_per_meter is None and existing.stock_quantity_m is None:
            for key in (
                "price_per_meter",
                "stock_quantity_m",
                "lead_time_days",
                "supplier_priority",
                "is_preferred",
                "order_multiple_m",
            ):
                setattr(existing, key, data[key])
            logger.info("  ~ cable commercial seed %s %s", data["brand"], data["model"])
        if existing is not None:
            for key in (
                "supplier_name",
                "currency",
                "stock_status",
                "min_order_quantity_m",
                "is_discontinued",
                "price_updated_at",
                "stock_updated_at",
                "commercial_data_source",
            ):
                if getattr(existing, key, None) is None:
                    setattr(existing, key, data[key])
    await seed_demo_commercial_catalog(db)
    await db.flush()


async def seed_accessories(db) -> None:
    accessories_data = [
        dict(
            category="end_sleeve",
            name="Муфта концевая термоусаживаемая МКТ-10",
            article="МКТ-10",
            params=_accessory_params({"ip": "IP68"}, price_rub=780.0),
        ),
        dict(
            category="end_sleeve",
            name="Муфта концевая термоусаживаемая МКТ-25",
            article="МКТ-25",
            params=_accessory_params({"ip": "IP68"}, price_rub=1120.0),
        ),
        dict(
            category="junction_box",
            name="Муфта соединительная МСТ-10",
            article="МСТ-10",
            params=_accessory_params({"ip": "IP55"}, price_rub=940.0),
        ),
        dict(
            category="junction_box",
            name="Коробка соединительная КС-1",
            article="КС-1",
            params=_accessory_params({"max_cables": 4, "ip": "IP65"}, price_rub=1850.0),
        ),
        dict(
            category="thermostat",
            name="Термостат электронный ТЭ-1",
            article="ТЭ-1",
            params=_accessory_params({"channels": 1}, price_rub=4200.0),
        ),
        dict(
            category="thermostat",
            name="Термостат двухканальный ТЭ-2",
            article="ТЭ-2",
            params=_accessory_params({"channels": 2}, price_rub=6900.0),
        ),
        dict(
            category="fastener",
            name="Лента стальная перфорированная 20мм",
            article="ЛС-20",
            params=_accessory_params({"width_mm": 20}, price_rub=65.0),
        ),
        dict(
            category="fastener",
            name="Хомут пластиковый 200мм",
            article="ХП-200",
            params=_accessory_params({"length_mm": 200}, price_rub=8.0),
        ),
        dict(
            category="protection",
            name="Защитный кожух из оцинкованной стали 100мм",
            article="КЗ-100",
            params=_accessory_params({"diameter_mm": 100}, price_rub=1450.0),
        ),
        dict(
            category="protection",
            name="Защитная сетка плетёная СЗП-50",
            article="СЗП-50",
            params=_accessory_params({"cell_mm": 50}, price_rub=390.0),
        ),
    ]
    for data in accessories_data:
        result = await db.execute(
            select(AccessoryExtended).where(AccessoryExtended.article == data["article"])
        )
        existing = result.scalar_one_or_none()
        if existing is None:
            db.add(AccessoryExtended(**data))
            logger.info("  + accessory %s", data["article"])
        else:
            params = existing.params if isinstance(existing.params, dict) else {}
            if params.get("commercial_data_source") in (None, "seed", "demo_seed", "test"):
                existing.params = data["params"]
                logger.info("  ~ accessory commercial %s", data["article"])
    await db.flush()


async def seed_projects(db, users: list[User]) -> list[Project]:
    projects_data = [
        dict(
            name="Трубопровод ДНС-1 (обогрев)",
            description="Обогрев выкидной линии насосной станции",
            status="draft",
        ),
        dict(
            name="Резервуарный парк РП-2",
            description="Противозамерзательный обогрев сырьевых резервуаров",
            status="draft",
        ),
        dict(
            name="Насосная станция НС-3",
            description="Обогрев всасывающих трубопроводов НС",
            status="completed",
        ),
        dict(
            name="Узел учёта нефти УУН-4",
            description="Обогрев приборных линий узла учёта",
            status="draft",
        ),
        dict(
            name="Компрессорная станция КС-5",
            description="Обогрев технологических трубопроводов КС",
            status="completed",
        ),
        dict(
            name="Установка подготовки нефти УПН-6",
            description="Обогрев дренажных линий установки",
            status="completed",
        ),
        dict(
            name="Факельная установка ФУ-7",
            description="Обогрев жидкостных линий факельной системы",
            status="draft",
        ),
        dict(
            name="Площадка ПХГ-8",
            description="Обогрев газопроводов подземного хранилища",
            status="completed",
        ),
        dict(
            name="Объект «Северный» (реконструкция)",
            description="Замена электрообогрева трубопроводов северного куста",
            status="draft",
        ),
        dict(
            name="Производственная база ПБ-10",
            description="Обогрев водопроводных труб базы",
            status="completed",
        ),
    ]
    employees = [u for u in users if u.role == "employee"]
    projects = []
    for i, data in enumerate(projects_data):
        result = await db.execute(select(Project).where(Project.name == data["name"]))
        project = result.scalar_one_or_none()
        if project is None:
            owner = employees[i % len(employees)]
            project = Project(**data, user_id=owner.id)
            db.add(project)
            logger.info("  + project '%s'", data["name"])
        projects.append(project)
    await db.flush()
    return projects


# Конфигурации объектов — только pipe и tank (поддерживаются сервисом расчётов)
# Поля соответствуют PipeHeatLossParams / TankHeatLossParams
_PIPE_CONFIGS = [
    {
        "name": "Трубопровод Ду100 L=120м (надземный)",
        "params": {
            "outer_diameter": 0.114,
            "wall_thickness": 0.006,
            "pipe_material": "carbon_steel",
            "insulation_thickness": 0.05,
            "insulation_material": "mineral_wool_cylinders_100",
            "insulation_temperature_basis": "outdoor_winter",
            "ambient_temperature": -30.0,
            "process_temperature": 60.0,
            "pipe_length": 120.0,
            "location": "outdoor",
            "wind_speed": 5.0,
        },
    },
    {
        "name": "Трубопровод Ду50 L=85м (крытый)",
        "params": {
            "outer_diameter": 0.060,
            "wall_thickness": 0.004,
            "pipe_material": "carbon_steel",
            "insulation_thickness": 0.04,
            "insulation_material": "polyurethane_products_50",
            "insulation_temperature_basis": "indoor",
            "ambient_temperature": -25.0,
            "process_temperature": 40.0,
            "pipe_length": 85.0,
            "location": "indoor",
        },
    },
    {
        "name": "Трубопровод Ду200 L=250м (подземный)",
        "params": {
            "outer_diameter": 0.219,
            "wall_thickness": 0.008,
            "pipe_material": "carbon_steel",
            "insulation_thickness": 0.12,
            "insulation_material": "mineral_wool_cylinders_150",
            "insulation_temperature_basis": "channel",
            "ambient_temperature": -25.0,
            "process_temperature": 55.0,
            "pipe_length": 250.0,
            "burial_depth": 1.5,
            "placement": "underground",
            "location": "outdoor",
        },
    },
    {
        "name": "Трубопровод Ду32 L=45м (КИП)",
        "params": {
            "outer_diameter": 0.042,
            "wall_thickness": 0.003,
            "pipe_material": "stainless_304",
            "insulation_thickness": 0.03,
            "insulation_material": "k_flex_st",
            "insulation_temperature_basis": "outdoor_winter",
            "ambient_temperature": -40.0,
            "process_temperature": 30.0,
            "pipe_length": 45.0,
            "location": "outdoor",
            "wind_speed": 8.0,
        },
    },
    {
        "name": "Трубопровод Ду150 L=190м (многослойная изоляция)",
        "params": {
            "outer_diameter": 0.168,
            "wall_thickness": 0.007,
            "pipe_material": "carbon_steel",
            "insulation_layers": [
                {"thickness": 0.05, "material": "mineral_wool_cylinders_100"},
                {"thickness": 0.03, "material": "expanded_perlite_sand_150"},
            ],
            "insulation_temperature_basis": "outdoor_winter",
            "ambient_temperature": -30.0,
            "process_temperature": 60.0,
            "pipe_length": 190.0,
            "location": "outdoor",
            "wind_speed": 4.0,
        },
    },
    {
        "name": "Трубопровод Ду80 L=65м (локальные элементы)",
        "params": {
            "outer_diameter": 0.089,
            "wall_thickness": 0.005,
            "pipe_material": "carbon_steel",
            "insulation_thickness": 0.05,
            "insulation_material": "polystyrene_products_50",
            "insulation_temperature_basis": "outdoor_winter",
            "ambient_temperature": -30.0,
            "process_temperature": 55.0,
            "pipe_length": 65.0,
            "num_local_elements": 4,
            "local_element_equiv_length": 1.5,
            "location": "outdoor",
        },
    },
    {
        "name": "Трубопровод Ду25 L=30м (нержавейка)",
        "params": {
            "outer_diameter": 0.032,
            "wall_thickness": 0.003,
            "pipe_material": "stainless_304",
            "insulation_thickness": 0.025,
            "insulation_material": "mineral_wool_cylinders_80",
            "insulation_temperature_basis": "indoor",
            "ambient_temperature": -35.0,
            "process_temperature": 25.0,
            "pipe_length": 30.0,
            "location": "indoor",
        },
    },
]

_TANK_CONFIGS = [
    {
        "name": "Резервуар РВС-100 (цилиндр)",
        "params": {
            "shape": "cylindrical",
            "diameter": 2.8,
            "height": 6.0,
            "insulation_thickness": 0.08,
            "insulation_material": "mineral_wool_boards_120",
            "insulation_temperature_basis": "outdoor_winter",
            "ambient_temperature": -35.0,
            "process_temperature": 50.0,
            "location": "outdoor",
        },
    },
    {
        "name": "Ёмкость дренажная ЕД-10 (прямоугольник)",
        "params": {
            "shape": "rectangular",
            "length": 3.0,
            "width": 2.0,
            "height": 2.0,
            "insulation_thickness": 0.06,
            "insulation_material": "polyurethane_products_50",
            "insulation_temperature_basis": "outdoor_winter",
            "ambient_temperature": -30.0,
            "process_temperature": 45.0,
            "location": "outdoor",
        },
    },
    {
        "name": "Сепаратор СГ-25 (цилиндр)",
        "params": {
            "shape": "cylindrical",
            "diameter": 2.4,
            "height": 4.5,
            "insulation_thickness": 0.07,
            "insulation_material": "expanded_perlite_sand_150",
            "insulation_temperature_basis": "outdoor_winter",
            "ambient_temperature": -40.0,
            "process_temperature": 60.0,
            "location": "outdoor",
        },
    },
]


async def seed_objects_and_calculations(
    db,
    projects: list[Project],
    coefficients_list: list[CorrectionCoefficient],
) -> None:
    """Создаёт объекты с реальными расчётами теплопотерь и электрорасчётами."""
    coefficients = _get_coefficients_dict(coefficients_list)

    # Всего 10 проектов. Раскладываем: 6 pipe + 2 tank + ещё mix
    # Схема на проект: 2-3 объекта (mix pipe/tank)
    # Всего будет ~25 объектов
    project_object_plan = [
        # (object_type, config_index_in_respective_list)
        [("pipe", 0), ("pipe", 1), ("tank", 0)],  # проект 0
        [("tank", 1), ("pipe", 2), ("pipe", 3)],  # проект 1
        [("pipe", 4), ("tank", 2), ("pipe", 5)],  # проект 2
        [("pipe", 0), ("pipe", 1)],  # проект 3
        [("pipe", 2), ("tank", 0), ("pipe", 6)],  # проект 4
        [("tank", 1), ("pipe", 3), ("pipe", 4)],  # проект 5
        [("pipe", 5), ("pipe", 6), ("tank", 2)],  # проект 6
        [("pipe", 0), ("tank", 0)],  # проект 7
        [("pipe", 1), ("pipe", 2), ("pipe", 3)],  # проект 8
        [("tank", 1), ("tank", 2), ("pipe", 4)],  # проект 9
    ]

    pipe_cfgs = _PIPE_CONFIGS
    tank_cfgs = _TANK_CONFIGS

    for proj_idx, project in enumerate(projects):
        plan = project_object_plan[proj_idx % len(project_object_plan)]

        for sort_order, (obj_type, cfg_idx) in enumerate(plan):
            cfg = pipe_cfgs[cfg_idx] if obj_type == "pipe" else tank_cfgs[cfg_idx]

            # Проверяем существование
            result = await db.execute(
                select(ProjectObject).where(
                    ProjectObject.project_id == project.id,
                    ProjectObject.sort_order == sort_order,
                )
            )
            obj = result.scalar_one_or_none()
            if obj is not None:
                params_are_current = _seed_params_are_current(obj.params, cfg["params"])
                # Пропускаем только если объект валиден, рассчитан и уже соответствует
                # текущему seed-контракту. Старые demo-объекты с generic материалами
                # нужно пересоздать даже при наличии прежних результатов.
                if obj.is_valid and obj.results is not None and params_are_current:
                    logger.info("  ~ skip valid object [%s] for '%s'", obj_type, project.name)
                    continue
                # Иначе удаляем сломанный или устаревший объект и создаём заново
                logger.info(
                    (
                        "  ~ replace stale/broken object [%s] "
                        "(is_valid=%s, has_results=%s, params_current=%s) for '%s'"
                    ),
                    obj_type,
                    obj.is_valid,
                    obj.results is not None,
                    params_are_current,
                    project.name,
                )
                # Удаляем связанные электрорасчёты
                elec_result = await db.execute(
                    select(ElectricalCalculation).where(ElectricalCalculation.object_id == obj.id)
                )
                for ec in elec_result.scalars().all():
                    await db.delete(ec)
                await db.delete(obj)
                await db.flush()

            # Рассчитываем теплопотери
            try:
                if obj_type == "pipe":
                    hl_params = PipeHeatLossParams(**cfg["params"])
                    hl_result = calc_pipe_heat_loss(hl_params, coefficients=coefficients)
                    results_dict = hl_result.model_dump()
                else:
                    hl_params_t = TankHeatLossParams(**cfg["params"])
                    hl_result = calc_tank_heat_loss(hl_params_t, coefficients=coefficients)
                    results_dict = hl_result.model_dump()
                is_valid = True
                validation_errors = None
            except Exception as exc:
                results_dict = None
                is_valid = False
                validation_errors = {
                    "error_code": "seed_heat_loss_error",
                    "category": "formula",
                    "message": str(exc),
                    "field": None,
                    "hint": "Проверьте seed-параметры объекта.",
                }
                logger.warning("  ! calc error [%s] '%s': %s", obj_type, cfg["name"], exc)

            obj = ProjectObject(
                project_id=project.id,
                object_type=obj_type,
                sort_order=sort_order,
                params=cfg["params"],
                results=results_dict,
                is_valid=is_valid,
                validation_errors=validation_errors,
            )
            db.add(obj)
            logger.info(
                "  + object [%s] '%s' for '%s' → %s",
                obj_type,
                cfg["name"],
                project.name,
                "OK" if is_valid else "INVALID",
            )

        await db.flush()

        # Электрорасчёт только для pipe-объектов этого проекта
        pipe_objects_result = await db.execute(
            select(ProjectObject).where(
                ProjectObject.project_id == project.id,
                ProjectObject.object_type == "pipe",
                ProjectObject.is_valid.is_(True),
            )
        )
        pipe_objects = list(pipe_objects_result.scalars().all())

        for pipe_obj in pipe_objects:
            # Пропускаем если уже есть расчёт
            existing_calc = await db.execute(
                select(ElectricalCalculation).where(
                    ElectricalCalculation.object_id == pipe_obj.id,
                    ElectricalCalculation.variant_number == 1,
                )
            )
            if existing_calc.scalar_one_or_none() is not None:
                continue

            # Берём heat_loss_per_meter из результатов объекта
            heat_loss_per_meter = (
                pipe_obj.results.get("heat_loss_per_meter", 0) if pipe_obj.results else 0
            )
            pipe_length = pipe_obj.params.get("pipe_length", 100.0)
            ambient_temperature = pipe_obj.params.get("ambient_temperature", -30.0)
            process_temperature = pipe_obj.params.get("process_temperature", 80.0)

            if heat_loss_per_meter <= 0:
                logger.warning("  ! skip elec calc for object %s: heat_loss=0", pipe_obj.id)
                continue

            try:
                elec_params = SelfRegulatingParams(
                    required_power_per_meter=heat_loss_per_meter,
                    cable_mark=None,  # автоподбор
                    supply_voltage=220.0,
                    ambient_temperature=ambient_temperature,
                    process_temperature=process_temperature,
                    pipe_length=pipe_length,
                    safety_factor=1.0,  # коэффициент уже применён в теплопотерях
                )
                elec_result = calc_self_regulating(elec_params)
                elec_results_dict = elec_result.model_dump()
                cable_mark = elec_result.selected_cable
                logger.info(
                    "  + elec_calc '%s' → кабель %s, длина %.1f м",
                    pipe_obj.params.get("outer_diameter", "?"),
                    cable_mark,
                    elec_result.cable_length,
                )
            except Exception as exc:
                logger.warning("  ! elec_calc error for object %s: %s", pipe_obj.id, exc)
                continue

            elec_calc = ElectricalCalculation(
                project_id=project.id,
                object_id=pipe_obj.id,
                variant_number=1,
                cable_type="self_regulating",
                cable_mark=cable_mark,
                params={
                    "required_power_per_meter": heat_loss_per_meter,
                    "pipe_length": pipe_length,
                    "ambient_temperature": ambient_temperature,
                    "supply_voltage": 220.0,
                    "safety_factor": 1.0,
                },
                results=elec_results_dict,
            )
            db.add(elec_calc)

        await db.flush()


async def seed_specifications(db, projects: list[Project]) -> None:
    """Генерирует спецификации для проектов, у которых есть электрорасчёты."""
    for project in projects:
        # Собираем результаты электрорасчётов
        calcs_result = await db.execute(
            select(ElectricalCalculation).where(ElectricalCalculation.project_id == project.id)
        )
        calcs = list(calcs_result.scalars().all())
        if not calcs:
            continue

        electrical_results = [c.results or {} for c in calcs]
        items = build_basic_specification(electrical_results)
        items_payload = [i.model_dump() for i in items]

        existing_result = await db.execute(
            select(Specification).where(
                Specification.project_id == project.id,
                Specification.variant_number == 1,
            )
        )
        existing = existing_result.scalar_one_or_none()
        if existing is None:
            spec = Specification(
                project_id=project.id,
                variant_number=1,
                items=items_payload,
            )
            db.add(spec)
            logger.info(
                "  + specification for '%s' (%d позиций)",
                project.name,
                len(items_payload),
            )
        elif existing.items != items_payload:
            existing.items = items_payload
            logger.info(
                "  ~ refresh specification for '%s' (%d позиций)",
                project.name,
                len(items_payload),
            )

    await db.flush()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


async def run_seeds() -> None:
    async with AsyncSessionLocal() as db:
        logger.info("=== Seed: users ===")
        users = await seed_users(db)

        admin_result = await db.execute(select(User).where(User.role == "admin").limit(1))
        admin = admin_result.scalar_one_or_none()
        admin_id = admin.id if admin else None

        logger.info("=== Seed: correction coefficients ===")
        coefficients = await seed_coefficients(db, admin_id)

        logger.info("=== Seed: insulation_materials ===")
        await seed_insulation_materials(db)

        logger.info("=== Seed: cables_extended ===")
        await seed_cables(db)

        logger.info("=== Seed: accessories_extended ===")
        await seed_accessories(db)

        logger.info("=== Seed: projects ===")
        projects = await seed_projects(db, users)

        logger.info("=== Seed: project_objects + heat_loss + electrical_calculations ===")
        await seed_objects_and_calculations(db, projects, coefficients)

        logger.info("=== Seed: specifications ===")
        await seed_specifications(db, projects)

        await db.commit()
        logger.info("=== Seeds complete ===")


if __name__ == "__main__":
    asyncio.run(run_seeds())
