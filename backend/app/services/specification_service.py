"""Сервис спецификаций."""

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

    async def generate(self, project_id: UUID, variant_number: int = 1) -> list[SpecificationItem]:
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
        electrical_results = [c.results or {} for c in calcs]

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
        else:
            spec = Specification(
                project_id=project_id,
                variant_number=variant_number,
                items=[i.model_dump() for i in items],
            )
            self.db.add(spec)

        await self.db.commit()
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
            )
            self.db.add(spec)
        else:
            spec.items = payload
        await self.db.commit()
        return items
