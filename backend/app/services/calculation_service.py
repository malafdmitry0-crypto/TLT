"""Сервис расчётов: теплопотери + электротехнический расчёт."""

from typing import Any, cast
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.formulas.electrical.self_regulating import calc_self_regulating
from app.formulas.heat_loss.pipe import calc_pipe_heat_loss
from app.formulas.heat_loss.tank import calc_tank_heat_loss
from app.models.cable import CableExtended
from app.models.coefficient import CorrectionCoefficient
from app.models.electrical_calculation import ElectricalCalculation
from app.models.project_object import ProjectObject
from app.reference_data.loader import list_tlt_cables
from app.result import Err, Ok, Result
from app.schemas.calculation import (
    ElectricalRequest,
    PipeHeatLossParams,
    SelfRegulatingParams,
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

        builtin  — только встроенная линейка ТЛТ
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
        if request.cable_type != "self_regulating":
            raise CalculationError("В MVP поддерживается только саморегулирующийся кабель ТЛТ")
        params = SelfRegulatingParams(**request.data)
        result = calc_self_regulating(params)

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
                cable_mark=result.selected_cable,
                params=request.data,
                results=result.model_dump(),
            )
            self.db.add(calc)
        else:
            calc.cable_type = request.cable_type
            calc.cable_mark = result.selected_cable
            calc.params = request.data
            calc.results = result.model_dump()
        await self.db.commit()
        await self.db.refresh(calc)
        return calc

    async def select_cable_manual(
        self,
        object_id: UUID,
        cable_mark: str,
        cable_source: CableSource = "builtin",
        variant_number: int = 1,
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

        params = obj.params or {}
        results = obj.results or {}
        if obj.object_type == "pipe":
            required_power = results.get("heat_loss_per_meter")
        else:
            required_power = results.get("heat_loss_per_m2")
        if required_power is None or float(required_power) <= 0:
            raise CalculationError("Теплопотери равны нулю — кабель не требуется")

        catalog = await self.load_cable_catalog(cable_source)
        request = ElectricalRequest(
            object_id=object_id,
            cable_type="self_regulating",
            variant_number=variant_number,
            data={
                "required_power_per_meter": float(required_power),
                "cable_mark": cable_mark,
                "supply_voltage": 220.0,
                "ambient_temperature": float(params.get("ambient_temperature", -20.0)),
                "process_temperature": (
                    float(params["process_temperature"])
                    if params.get("process_temperature") is not None
                    else None
                ),
                "pipe_length": float(params.get("pipe_length") or params.get("height") or 1.0),
                "safety_factor": 1.1,
                "cable_catalog": catalog,
            },
        )
        return await self.calc_electrical(request)

    async def batch_calc_electrical(
        self,
        project_id: UUID,
        cable_source: CableSource = "builtin",
        variant_number: int = 1,
    ) -> tuple[int, int, list[dict[str, Any]], list[ElectricalCalculation]]:
        """Автоподбор кабеля для всех валидных объектов проекта (cable_mark=None)."""
        result = await self.db.execute(
            select(ProjectObject).where(
                ProjectObject.project_id == project_id,
                ProjectObject.is_valid == True,  # noqa: E712
            )
        )
        objects = list(result.scalars().all())
        calculated = 0
        skipped = 0
        errors: list[dict[str, Any]] = []
        calcs: list[ElectricalCalculation] = []
        catalog = await self.load_cable_catalog(cable_source)

        for obj in objects:
            try:
                params = obj.params or {}
                results = obj.results or {}

                # Определяем required_power_per_meter из результатов теплопотерь
                if obj.object_type == "pipe":
                    required_power = results.get("heat_loss_per_meter")
                else:  # tank — используем тепловой поток на м²
                    required_power = results.get("heat_loss_per_m2")

                if required_power is None or float(required_power) <= 0:
                    skipped += 1
                    err_msg = "Теплопотери не рассчитаны или равны нулю — электрорасчёт невозможен"
                    errors.append({"object_id": str(obj.id), "error": err_msg})
                    await self._save_failed_electrical(obj, err_msg, variant_number)
                    continue

                pipe_length = params.get("pipe_length") or params.get("height") or 1.0
                ambient_temperature = params.get("ambient_temperature", -20.0)
                process_temperature = params.get("process_temperature")

                request = ElectricalRequest(
                    object_id=obj.id,
                    cable_type="self_regulating",
                    variant_number=variant_number,
                    data={
                        "required_power_per_meter": float(required_power),
                        "cable_mark": None,
                        "supply_voltage": 220.0,
                        "ambient_temperature": float(ambient_temperature),
                        "process_temperature": (
                            float(process_temperature) if process_temperature is not None else None
                        ),
                        "pipe_length": float(pipe_length),
                        "safety_factor": 1.1,
                        "cable_catalog": catalog,
                    },
                )
                calc = await self.calc_electrical(request)
                calcs.append(calc)
                calculated += 1
            except Exception as exc:
                skipped += 1
                err_msg = f"{type(exc).__name__}: {exc}"
                errors.append({"object_id": str(obj.id), "error": err_msg})
                await self._save_failed_electrical(obj, err_msg, variant_number)

        return calculated, skipped, errors, calcs

    async def _save_failed_electrical(
        self, obj: ProjectObject, error_message: str, variant_number: int = 1
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
                cable_type="self_regulating",
                cable_mark=None,
                params={},
                results=payload,
            )
            self.db.add(row)
        else:
            row.cable_mark = None
            row.results = payload
        await self.db.commit()

    async def get_cable_options(self, object_id: UUID) -> list[dict[str, Any]]:
        from app.reference_data.loader import list_tlt_cables

        return list_tlt_cables()
