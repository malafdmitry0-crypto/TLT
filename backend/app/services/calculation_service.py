"""Сервис расчётов: теплопотери + электротехнический расчёт."""

import math
from typing import Any, cast
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.formulas.electrical.cable_geometry import compute_tank_cable_length
from app.formulas.electrical.resistive import calc_resistive_single_core, calc_resistive_three_core
from app.formulas.electrical.self_regulating import calc_self_regulating, calc_self_regulating_tt
from app.formulas.heat_loss.pipe import calc_pipe_heat_loss
from app.formulas.heat_loss.tank import calc_tank_heat_loss
from app.models.cable import CableExtended
from app.models.coefficient import CorrectionCoefficient
from app.models.electrical_calculation import ElectricalCalculation
from app.models.project_object import ProjectObject
from app.reference_data.loader import list_resistive_cables, list_tlt_cables
from app.result import Err, Ok, Result
from app.schemas.calculation import (
    ElectricalRequest,
    PipeHeatLossParams,
    ResistiveSingleCoreParams,
    ResistiveThreeCoreParams,
    SelfRegulatingParams,
    SelfRegulatingTTParams,
    TankHeatLossParams,
)
from app.schemas.json_shapes import (
    HeatLossResultDict,
    PipeHeatLossResultDict,
    TankHeatLossResultDict,
)

# Источник каталога кабелей. Значения заданы для совместимости с текущим API;
# внутри функций валидируется через проверку, не enum (чтобы случайная строка
# попадала в default, а не падала).
CableSource = str  # "builtin" | "extended" | "all"


class CalculationError(Exception):
    pass


class CalculationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_coefficients(self) -> dict[str, float]:
        # Кэш в Redis: коэффициенты меняются редко (через админ-CRUD),
        # а читаются на КАЖДОМ recalculate. Инвалидация — `cache.invalidate("coefficients")`
        # в `admin_service.update_coefficient`.
        from app.core.cache import cache

        cached = cache.get("coefficients")
        if cached is not None:
            return cached
        result = await self.db.execute(select(CorrectionCoefficient))
        coeffs = {row.key: row.value for row in result.scalars().all()}
        cache.set("coefficients", coeffs, ttl=3600)
        return coeffs

    async def load_cable_catalog(self, source: CableSource = "builtin") -> list[dict[str, Any]]:
        """Возвращает каталог кабелей по запрошенному источнику.

        builtin  — встроенная линейка ТЛТ для self_regulating
        extended — только `cables_extended` (self_regulating)
        all      — объединение
        """
        if source not in ("builtin", "extended", "all"):
            source = "builtin"
        builtin = [{**c, "source": "builtin"} for c in list_tlt_cables()]
        if source == "builtin":
            return builtin
        result = await self.db.execute(
            select(CableExtended).where(
                CableExtended.is_active.is_(True),
                CableExtended.cable_type == "self_regulating",
            )
        )
        extended = [
            {
                "source": "extended",
                "cable_type": c.cable_type,
                "brand": c.brand,
                "model": c.model,
                "power_per_meter": c.power_per_meter,
                "max_temperature": c.max_temperature,
                "min_temperature": c.min_temperature,
                "resistance_per_meter": c.resistance_per_meter,
            }
            for c in result.scalars().all()
        ]
        if source == "extended":
            return extended
        return builtin + extended

    async def calc_heat_loss(self, object_type: str, data: dict[str, Any]) -> HeatLossResultDict:
        """Возвращает результат теплорасчёта в формате, совпадающем с JSONB.

        Для pipe → `PipeHeatLossResultDict`, для tank → `TankHeatLossResultDict`.
        Этот же dict кладётся в `ProjectObject.results`.
        """
        coefficients = await self.get_coefficients()
        if object_type == "pipe":
            params = PipeHeatLossParams(**data)
            pipe_result = calc_pipe_heat_loss(params, coefficients=coefficients)
            return cast(PipeHeatLossResultDict, pipe_result.model_dump())
        elif object_type == "tank":
            params_t = TankHeatLossParams(**data)
            tank_result = calc_tank_heat_loss(params_t, coefficients=coefficients)
            return cast(TankHeatLossResultDict, tank_result.model_dump())
        else:
            raise CalculationError(f"Неподдерживаемый тип объекта: {object_type}")

    async def recalculate_object(self, obj: ProjectObject) -> ProjectObject:
        """Автопересчёт объекта при изменении параметров (мутирует obj).

        Для получения явного Ok/Err без мутации-сайд-эффекта используйте
        `try_recalculate(obj)` — он возвращает `Result[ProjectObject, str]`,
        что позволяет mypy проверить обработку ошибок.

        Args:
            obj: объект проекта; поля `results`, `is_valid`, `validation_errors`
                обновляются на месте.

        Returns:
            Тот же `obj` (удобство для цепочки вызовов / SQLAlchemy-коммита).

        Side effects:
            При ошибке устанавливает `obj.is_valid=False` и пишет причину в
            `obj.validation_errors={"error": "..."}`.
        """
        await self.try_recalculate(obj)
        # Независимо от Ok/Err, try_recalculate мутирует obj на месте
        # (обновляет results/is_valid/validation_errors). Возвращаем тот же obj.
        return obj

    async def try_recalculate(self, obj: ProjectObject) -> Result[ProjectObject, str]:
        """Пересчёт объекта с явным Result-типом.

        Args:
            obj: объект проекта (мутируется как в `recalculate_object`).

        Returns:
            `Ok(obj)` если теплорасчёт прошёл успешно,
            `Err(message)` если формула/Pydantic кинули исключение.

        Example:
            >>> r = await service.try_recalculate(obj)
            >>> if r.is_err:
            ...     log.warning("Объект не пересчитан: %s", r.error)
            >>> # obj.is_valid / obj.validation_errors всё равно обновлены
        """
        try:
            result = await self.calc_heat_loss(obj.object_type, obj.params)
            obj.results = cast(dict[str, Any], result)
            obj.is_valid = True
            obj.validation_errors = None
            return Ok(obj)
        except Exception as exc:
            message = str(exc)
            obj.results = None
            obj.is_valid = False
            obj.validation_errors = {"error": message}
            return Err(message)

    async def batch_recalculate(self, project_id: UUID) -> tuple[int, int, list[dict[str, Any]]]:
        result = await self.db.execute(
            select(ProjectObject).where(ProjectObject.project_id == project_id)
        )
        objects = list(result.scalars().all())
        updated = 0
        failed = 0
        errors: list[dict[str, Any]] = []
        for obj in objects:
            await self.recalculate_object(obj)
            if obj.is_valid:
                updated += 1
            else:
                failed += 1
                errors.append({"object_id": str(obj.id), "error": obj.validation_errors})
        await self.db.commit()
        return updated, failed, errors

    async def calc_electrical(self, request: ElectricalRequest) -> ElectricalCalculation:
        cable_type = request.cable_type
        if cable_type == "self_regulating":
            params_sr = SelfRegulatingParams(**request.data)
            result_obj = calc_self_regulating(params_sr)
            cable_mark = result_obj.selected_cable
            result_dict = result_obj.model_dump()
        elif cable_type == "self_regulating_tt":
            params_tt = SelfRegulatingTTParams(**request.data)
            result_tt = calc_self_regulating_tt(params_tt)
            cable_mark = result_tt.cable_mark
            result_dict = result_tt.model_dump()
        elif cable_type == "single_core":
            params_sc = ResistiveSingleCoreParams(**request.data)
            result_sc = calc_resistive_single_core(params_sc)
            cable_mark = result_sc.selected_cable
            result_dict = result_sc.model_dump()
        elif cable_type == "three_core":
            params_tc = ResistiveThreeCoreParams(**request.data)
            result_tc = calc_resistive_three_core(params_tc)
            cable_mark = result_tc.selected_cable
            result_dict = result_tc.model_dump()
        else:
            raise CalculationError(
                f"Для типа кабеля «{cable_type}» расчётная формула не реализована"
            )

        # Получаем объект, чтобы узнать project_id
        obj_result = await self.db.execute(
            select(ProjectObject).where(ProjectObject.id == request.object_id)
        )
        obj = obj_result.scalar_one_or_none()
        if obj is None:
            raise CalculationError("Объект не найден")

        # Upsert по (object_id, variant_number) — чтобы повторный пересчёт
        # обновлял существующую строку и «затирал» предыдущую ошибку.
        existing = await self.db.execute(
            select(ElectricalCalculation).where(
                ElectricalCalculation.object_id == obj.id,
                ElectricalCalculation.variant_number == request.variant_number,
            )
        )
        calc = existing.scalars().first()
        if calc is None:
            calc = ElectricalCalculation(
                project_id=obj.project_id,
                object_id=obj.id,
                variant_number=request.variant_number,
                cable_type=request.cable_type,
                cable_mark=cable_mark,
                params=request.data,
                results=result_dict,
            )
            self.db.add(calc)
        else:
            calc.cable_type = request.cable_type
            calc.cable_mark = cable_mark
            calc.params = request.data
            calc.results = result_dict
        await self.db.commit()
        await self.db.refresh(calc)
        return calc

    @staticmethod
    def _num(value: Any, default: float | None = None) -> float | None:
        if value is None or value == "":
            return default
        return float(value)

    @staticmethod
    def _positive(value: Any, message: str) -> float:
        parsed = CalculationService._num(value)
        if parsed is None or parsed <= 0:
            raise CalculationError(message)
        return parsed

    @staticmethod
    def _required_num(value: Any, message: str) -> float:
        parsed = CalculationService._num(value)
        if parsed is None:
            raise CalculationError(message)
        return parsed

    @staticmethod
    def _positive_heat_loss(value: Any) -> float:
        parsed = CalculationService._num(value)
        if parsed is None:
            raise CalculationError(
                "Теплопотери не рассчитаны или равны нулю — электрорасчёт невозможен"
            )
        if parsed <= 0:
            raise CalculationError("Теплопотери равны нулю — кабель не требуется")
        return parsed

    def _tank_geometry_payload(
        self,
        obj: ProjectObject,
        overrides: dict[str, Any],
    ) -> dict[str, Any]:
        """Параметры укладки кабеля на резервуар из формы/объекта.

        Для расчёта длины нужны `heating_height` и `laying_step`. Если высота
        обогрева не задана явно, используем высоту резервуара как инженерный
        дефолт для полного обогрева стенки.
        """
        if obj.object_type != "tank":
            return {}
        params = obj.params or {}
        shape = params.get("shape")
        if shape not in ("cylindrical", "rectangular"):
            return {}

        pitch_mm = self._num(overrides.get("winding_pitch"))
        laying_step = self._num(overrides.get("laying_step") or params.get("laying_step"))
        if laying_step is None and pitch_mm is not None and pitch_mm > 0:
            laying_step = pitch_mm / 1000.0
        heating_height = self._num(
            overrides.get("heating_height") or params.get("heating_height") or params.get("height")
        )
        if laying_step is None or heating_height is None:
            return {}

        payload: dict[str, Any] = {
            "tank_shape": shape,
            "heating_height": heating_height,
            "laying_step": laying_step,
        }
        if shape == "cylindrical":
            payload["tank_diameter"] = self._positive(
                params.get("diameter"), "Для резервуара требуется diameter > 0"
            )
        else:
            payload["tank_length"] = self._positive(
                params.get("length"), "Для прямоугольного резервуара требуется length > 0"
            )
            payload["tank_width"] = self._positive(
                params.get("width"), "Для прямоугольного резервуара требуется width > 0"
            )
        return payload

    def _number_of_threads(
        self,
        overrides: dict[str, Any],
        params: dict[str, Any],
        default: int | None = 1,
    ) -> int | None:
        raw = overrides.get("number_of_threads")
        if raw is None:
            raw = params.get("number_of_threads")
        if raw is None:
            return default
        value = int(raw)
        if value < 1 or value > 3:
            raise ValueError("Количество ниток должно быть 1, 2 или 3")
        return value

    def _winding_pitch_mm(
        self,
        overrides: dict[str, Any],
        params: dict[str, Any],
    ) -> float | None:
        raw = overrides.get("winding_pitch")
        if raw is None:
            raw = overrides.get("winding_pitch_mm")
        if raw is None:
            raw = params.get("winding_pitch")
        return self._num(raw)

    def _winding_coefficient(
        self,
        obj: ProjectObject,
        overrides: dict[str, Any],
        params: dict[str, Any],
        default: float,
    ) -> float:
        pitch_mm = self._winding_pitch_mm(overrides, params)
        if pitch_mm is not None:
            if pitch_mm == 0:
                return 1.0
            if obj.object_type == "pipe":
                diameter = self._positive(
                    params.get("outer_diameter"),
                    "Для навива требуется наружный диаметр трубы",
                )
                pitch_m = pitch_mm / 1000.0
                if pitch_m <= diameter:
                    raise ValueError("Шаг навива должен быть больше наружного диаметра трубы")
                return math.sqrt(1.0 + (math.pi * diameter / pitch_m) ** 2)

        coefficient = self._num(
            overrides.get("winding_coefficient") or params.get("winding_coefficient"),
            default,
        )
        return coefficient or default

    def _tank_base_cable_length(
        self,
        obj: ProjectObject,
        overrides: dict[str, Any],
    ) -> float | None:
        payload = self._tank_geometry_payload(obj, overrides)
        if not payload:
            return None
        return compute_tank_cable_length(
            shape=str(payload["tank_shape"]),
            diameter=cast(float | None, payload.get("tank_diameter")),
            length=cast(float | None, payload.get("tank_length")),
            width=cast(float | None, payload.get("tank_width")),
            heating_height=float(payload["heating_height"]),
            laying_step=float(payload["laying_step"]),
        )

    def _base_cable_length(
        self,
        obj: ProjectObject,
        overrides: dict[str, Any],
        params: dict[str, Any],
        results: dict[str, Any],
    ) -> float:
        """Базовая длина обогрева до монтажного запаса кабеля.

        Для труб электрический расчёт должен идти по `effective_length`, потому
        что теплорасчёт уже включает локальные элементы в эту длину. Для
        резервуаров используем длину укладки по поверхности, если задана
        геометрия укладки.
        """
        if obj.object_type == "tank":
            tank_length = self._tank_base_cable_length(obj, overrides)
            if tank_length is not None and tank_length > 0:
                return tank_length
        return (
            self._num(
                results.get("effective_length")
                or params.get("pipe_length")
                or params.get("height"),
                1.0,
            )
            or 1.0
        )

    def _tank_heat_loss_without_double_safety(
        self,
        results: dict[str, Any],
        fallback_safety_factor: float,
    ) -> float:
        """Возвращает Q для передачи в формулы, которые сами добавляют K.

        `total_heat_loss` у резервуара уже содержит K, а электрическая
        формула применит K повторно. Значит на вход ей нужно отдать `Q / K`,
        включая часть `Q_доп`; иначе дополнительная теплопотеря будет
        ошибочно умножена на K второй раз.
        """
        total = self._positive_heat_loss(results.get("total_heat_loss"))
        k = float(results.get("safety_factor") or fallback_safety_factor or 1.1)
        return total / k

    def _required_power_per_meter(
        self,
        obj: ProjectObject,
        cable_type: str,
        overrides: dict[str, Any],
        safety_factor: float,
    ) -> float:
        results = obj.results or {}
        if obj.object_type == "pipe":
            return self._positive_heat_loss(results.get("heat_loss_per_meter"))

        # Для кабеля на резервуаре считаем требуемые Вт/м кабеля по
        # полной площади и реальной длине укладки, чтобы не сравнивать Вт/м²
        # напрямую с паспортными Вт/м кабеля.
        base_length = self._tank_base_cable_length(obj, overrides)
        if base_length is None or base_length <= 0:
            raise CalculationError(
                "Для электрорасчёта резервуара требуется геометрия укладки кабеля: "
                "цилиндр/параллелепипед, высота обогрева и шаг укладки"
            )
        heat_loss = self._tank_heat_loss_without_double_safety(obj.results or {}, safety_factor)
        return heat_loss / base_length

    def _resistive_manual_catalog(
        self,
        cable_type: str,
        cable_mark: str | None,
    ) -> list[dict[str, Any]] | None:
        if cable_mark is None:
            return None
        catalog = list_resistive_cables()
        key = "single_core" if cable_type == "single_core" else "three_core"
        match = [c for c in catalog.get(key, []) if c.get("model") == cable_mark]
        if not match:
            raise ValueError(f"Кабель «{cable_mark}» не найден в справочнике")
        return match

    def _build_electrical_data(
        self,
        *,
        obj: ProjectObject,
        cable_type: str,
        cable_mark: str | None,
        tlt_catalog: list[dict[str, Any]],
        overrides: dict[str, Any],
    ) -> dict[str, Any]:
        """Единый маппинг теплопотери/объект → payload электрической формулы."""
        if not obj.is_valid or not obj.results:
            raise CalculationError("Теплопотери объекта не рассчитаны — невозможно выбрать кабель")

        params = obj.params or {}
        results = obj.results or {}
        process_temperature = self._num(params.get("process_temperature"))
        supply_voltage = self._num(
            overrides.get("supply_voltage") or params.get("supply_voltage"),
            220.0,
        )
        safety_factor = self._num(
            params.get("safety_factor") or overrides.get("safety_factor"),
            1.1,
        )
        pipe_length = self._base_cable_length(obj, overrides, params, results)
        winding_pitch = self._winding_pitch_mm(overrides, params)

        if cable_type == "self_regulating":
            return {
                "required_power_per_meter": self._required_power_per_meter(
                    obj, cable_type, overrides, safety_factor or 1.1
                ),
                "cable_mark": cable_mark,
                "supply_voltage": supply_voltage,
                "ambient_temperature": float(params.get("ambient_temperature", -20.0)),
                "process_temperature": process_temperature,
                "pipe_length": pipe_length,
                "safety_factor": safety_factor,
                "cable_catalog": tlt_catalog,
                "winding_coefficient": self._winding_coefficient(obj, overrides, params, 1.0),
                "winding_pitch": winding_pitch,
                "number_of_threads": self._number_of_threads(overrides, params, 1),
            }

        if cable_type == "self_regulating_tt":
            data = {
                "required_power_per_meter": self._required_power_per_meter(
                    obj, cable_type, overrides, safety_factor or 1.1
                ),
                "pipe_length": pipe_length,
                "process_temperature": self._required_num(
                    process_temperature,
                    "Для ТТН/ТТВ/ТТХ требуется температура продукта",
                ),
                "supply_voltage": supply_voltage,
                "safety_factor": safety_factor,
                "cable_mark": cable_mark,
                "vapor_temperature": self._num(overrides.get("vapor_temperature")),
                "aggressive_product": bool(overrides.get("aggressive_product", False)),
                "winding_coefficient": self._winding_coefficient(obj, overrides, params, 1.1),
                "winding_pitch": winding_pitch,
                "number_of_threads": self._number_of_threads(overrides, params, None),
            }
            data.update(self._tank_geometry_payload(obj, overrides))
            return data

        if cable_type in ("single_core", "three_core"):
            default_connection = "line_1ph"
            data = {
                "required_heat_loss": self._positive_heat_loss(results.get("total_heat_loss")),
                "pipe_length": pipe_length,
                "add_length": self._num(overrides.get("add_length"), 0.0),
                "process_temperature": self._required_num(
                    process_temperature,
                    "Для резистивного кабеля требуется температура продукта",
                ),
                "supply_voltage": supply_voltage,
                "connection_type": overrides.get("connection_type") or default_connection,
                "winding_coefficient": self._winding_coefficient(obj, overrides, params, 1.0),
                "winding_pitch": winding_pitch,
                "number_of_threads": self._number_of_threads(overrides, params, 1),
                "cable_catalog": self._resistive_manual_catalog(cable_type, cable_mark),
            }
            data.update(self._tank_geometry_payload(obj, overrides))
            return data

        return {}

    def _layout_overrides_from_existing(self, calc: ElectricalCalculation | None) -> dict[str, Any]:
        if calc is None or not calc.results:
            return {}
        results = calc.results
        overrides: dict[str, Any] = {}
        if results.get("winding_pitch") is not None:
            overrides["winding_pitch"] = results.get("winding_pitch")
        if results.get("num_circuits") is not None:
            overrides["number_of_threads"] = results.get("num_circuits")
        if results.get("winding_coefficient") is not None and "winding_pitch" not in overrides:
            overrides["winding_coefficient"] = results.get("winding_coefficient")
        return overrides

    @staticmethod
    def _merge_electrical_overrides(
        base: dict[str, Any],
        saved_layout: dict[str, Any],
    ) -> dict[str, Any]:
        merged = dict(saved_layout)
        for key, value in base.items():
            if value is not None:
                merged[key] = value
        return merged

    async def select_cable_manual(
        self,
        object_id: UUID,
        cable_mark: str,
        cable_source: CableSource = "builtin",
        variant_number: int = 1,
        cable_type: str = "self_regulating",
        electrical_params: dict[str, Any] | None = None,
    ) -> ElectricalCalculation:
        """Ручной выбор кабеля: берёт параметры из объекта, пересчитывает, upsert."""
        obj_result = await self.db.execute(
            select(ProjectObject).where(ProjectObject.id == object_id)
        )
        obj = obj_result.scalar_one_or_none()
        if obj is None:
            raise CalculationError("Объект не найден")
        if not obj.is_valid or not obj.results:
            raise CalculationError("Теплопотери объекта не рассчитаны — невозможно выбрать кабель")

        catalog = await self.load_cable_catalog(cable_source)
        data = self._build_electrical_data(
            obj=obj,
            cable_type=cable_type,
            cable_mark=cable_mark,
            tlt_catalog=catalog,
            overrides=electrical_params or {},
        )
        request = ElectricalRequest(
            object_id=object_id,
            cable_type=cast(Any, cable_type),
            variant_number=variant_number,
            data=data,
        )
        return await self.calc_electrical(request)

    async def batch_calc_electrical(
        self,
        project_id: UUID,
        cable_source: CableSource = "builtin",
        variant_number: int = 1,
        cable_type: str = "self_regulating",
        electrical_params: dict[str, Any] | None = None,
        skip_manual: bool = False,
    ) -> tuple[int, int, int, list[dict[str, Any]], list[ElectricalCalculation]]:
        """Автоподбор кабеля для всех валидных объектов проекта (cable_mark=None)."""
        # Считаем общее количество объектов в проекте — чтобы сообщить фронту,
        # сколько объектов исключено из-за ошибок теплопотерь.
        total_count: int = (
            await self.db.scalar(
                select(func.count())
                .select_from(ProjectObject)
                .where(
                    ProjectObject.project_id == project_id,
                )
            )
            or 0
        )

        result = await self.db.execute(
            select(ProjectObject).where(
                ProjectObject.project_id == project_id,
                ProjectObject.is_valid == True,  # noqa: E712
            )
        )
        objects = list(result.scalars().all())
        heat_loss_failed = total_count - len(objects)
        calculated = 0
        skipped = 0
        errors: list[dict[str, Any]] = []
        calcs: list[ElectricalCalculation] = []
        catalog = await self.load_cable_catalog(cable_source)
        existing_result = await self.db.execute(
            select(ElectricalCalculation).where(
                ElectricalCalculation.project_id == project_id,
                ElectricalCalculation.variant_number == variant_number,
            )
        )
        existing_by_object_id = {
            c.object_id: c
            for c in existing_result.scalars().all()
            if getattr(c, "object_id", None) is not None
        }
        base_overrides = electrical_params or {}

        for obj in objects:
            try:
                existing_calc = existing_by_object_id.get(obj.id)
                if (
                    skip_manual
                    and existing_calc is not None
                    and isinstance(existing_calc.params, dict)
                    and existing_calc.params.get("cable_mark") is not None
                ):
                    skipped += 1
                    continue
                overrides = self._merge_electrical_overrides(
                    base_overrides,
                    self._layout_overrides_from_existing(existing_calc),
                )
                request = ElectricalRequest(
                    object_id=obj.id,
                    cable_type=cast(Any, cable_type),
                    variant_number=variant_number,
                    data=self._build_electrical_data(
                        obj=obj,
                        cable_type=cable_type,
                        cable_mark=None,
                        tlt_catalog=catalog,
                        overrides=overrides,
                    ),
                )
                calc = await self.calc_electrical(request)
                calcs.append(calc)
                calculated += 1
            except Exception as exc:
                skipped += 1
                err_msg = f"{type(exc).__name__}: {exc}"
                errors.append({"object_id": str(obj.id), "error": err_msg})
                await self._save_failed_electrical(obj, err_msg, variant_number, cable_type)

        return calculated, skipped, heat_loss_failed, errors, calcs

    async def _save_failed_electrical(
        self,
        obj: ProjectObject,
        error_message: str,
        variant_number: int = 1,
        cable_type: str = "self_regulating",
    ) -> None:
        """Сохраняет или обновляет запись ElectricalCalculation с ошибкой."""
        existing = await self.db.execute(
            select(ElectricalCalculation).where(
                ElectricalCalculation.object_id == obj.id,
                ElectricalCalculation.variant_number == variant_number,
            )
        )
        row = existing.scalars().first()
        payload = {
            "error": error_message,
            "object_type": obj.object_type,
            "object_name": (obj.params or {}).get("name"),
        }
        if row is None:
            row = ElectricalCalculation(
                project_id=obj.project_id,
                object_id=obj.id,
                variant_number=variant_number,
                cable_type=cable_type,
                cable_mark=None,
                params={},
                results=payload,
            )
            self.db.add(row)
        else:
            row.cable_type = cable_type
            row.cable_mark = None
            row.results = payload
        await self.db.commit()

    async def get_cable_options(self, object_id: UUID) -> list[dict[str, Any]]:
        from app.reference_data.loader import list_tlt_cables

        return list_tlt_cables()
