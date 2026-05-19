"""Сервис спецификаций."""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.formulas.specification.builder import build_basic_specification
from app.models.electrical_calculation import ElectricalCalculation
from app.models.project_object import ProjectObject
from app.models.specification import Specification
from app.schemas.specification import SpecificationItem


class SpecificationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_specification(
        self, project_id: UUID, variant_number: int = 1
    ) -> Specification | None:
        result = await self.db.execute(
            select(Specification).where(
                Specification.project_id == project_id,
                Specification.variant_number == variant_number,
            )
        )
        return result.scalars().first()

    async def generate(
        self,
        project_id: UUID,
        variant_number: int = 1,
        *,
        commit: bool = True,
    ) -> list[SpecificationItem]:
        # Сохраняем ручные позиции (source='manual'), если они есть в текущей спецификации
        existing_q = await self.db.execute(
            select(Specification).where(
                Specification.project_id == project_id,
                Specification.variant_number == variant_number,
            )
        )
        existing_spec = existing_q.scalars().first()
        manual_items: list[SpecificationItem] = []
        if existing_spec and existing_spec.items:
            for raw in existing_spec.items:
                if raw.get("source") == "manual":
                    try:
                        manual_items.append(SpecificationItem(**raw))
                    except Exception:
                        # пропускаем любую битую запись, не блокируя пересчёт
                        continue

        # Авто-позиции из электрорасчёта (для конкретного варианта)
        result = await self.db.execute(
            select(ElectricalCalculation).where(
                ElectricalCalculation.project_id == project_id,
                ElectricalCalculation.variant_number == variant_number,
            )
        )
        calcs = list(result.scalars().all())
        electrical_results = [
            {
                **(c.results or {}),
                "cable_mark": c.cable_mark,
                "cable_type": c.cable_type,
                "cable_snapshot": c.cable_snapshot,
            }
            for c in calcs
        ]

        # Общее число объектов проекта — аксессуары заказываются на каждый
        # заявленный объект, даже если электрорасчёт для него не выполнен.
        total_objects = await self.db.scalar(
            select(func.count(ProjectObject.id)).where(ProjectObject.project_id == project_id)
        )
        auto_items = build_basic_specification(
            electrical_results,
            total_objects_count=int(total_objects or 0),
        )
        # Помечаем источник, чтобы фронт мог их отличать
        for item in auto_items:
            item.source = "auto"

        items = list(auto_items) + manual_items

        # Заменяем существующую спецификацию (или создаём новую)
        if existing_spec is not None:
            existing_spec.items = [i.model_dump() for i in items]
            self._reset_stale(existing_spec)
        else:
            spec = Specification(
                project_id=project_id,
                variant_number=variant_number,
                items=[i.model_dump() for i in items],
                is_stale=False,
            )
            self.db.add(spec)

        if commit:
            await self.db.commit()
        else:
            await self.db.flush()
        return items

    async def save_items(
        self,
        project_id: UUID,
        items: list[SpecificationItem],
        variant_number: int = 1,
    ) -> list[SpecificationItem]:
        """Полностью замещает items спецификации варианта (или создаёт её)."""
        existing = await self.db.execute(
            select(Specification).where(
                Specification.project_id == project_id,
                Specification.variant_number == variant_number,
            )
        )
        spec = existing.scalars().first()
        payload = [i.model_dump() for i in items]
        if spec is None:
            spec = Specification(
                project_id=project_id,
                variant_number=variant_number,
                items=payload,
                is_stale=False,
            )
            self.db.add(spec)
        else:
            spec.items = payload
            self._reset_stale(spec)
        await self.db.commit()
        return items

    async def mark_project_specifications_stale(
        self,
        project_id: UUID,
        reason: str,
        *,
        object_ids: list[UUID] | set[UUID] | tuple[UUID, ...] | None = None,
        operation: str | None = None,
        commit: bool = False,
    ) -> int:
        """Помечает сохранённые спецификации проекта как требующие регенерации.

        Старые позиции остаются в БД для просмотра и сохранения ручных строк, но
        больше не должны восприниматься как актуальный BoM для закупки.
        """
        result = await self.db.execute(
            select(Specification).where(Specification.project_id == project_id)
        )
        specs = list(result.scalars().all())
        if not specs:
            return 0

        now = datetime.now(UTC)
        details: dict[str, Any] = {"reason": reason}
        if operation:
            details["operation"] = operation
        if object_ids:
            details["object_ids"] = [str(item) for item in dict.fromkeys(object_ids)]

        for spec in specs:
            spec.is_stale = True
            spec.stale_reason = reason
            spec.stale_at = now
            spec.stale_details = details

        if commit:
            await self.db.commit()
        else:
            await self.db.flush()
        return len(specs)

    @staticmethod
    def _reset_stale(spec: Specification) -> None:
        spec.is_stale = False
        spec.stale_reason = None
        spec.stale_at = None
        spec.stale_details = None
