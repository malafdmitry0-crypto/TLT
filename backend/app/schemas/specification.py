"""Схемы спецификации."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SpecificationItem(BaseModel):
    category: str
    name: str
    article: str | None = None
    unit: str = "шт."
    quantity: float
    params: dict[str, Any] = Field(default_factory=dict)
    # 'auto' — построено генератором из электрорасчёта; 'manual' — добавлено сотрудником.
    # При перегенерации auto-позиции пересоздаются, manual — сохраняются.
    source: str | None = None


class SpecificationOptions(BaseModel):
    """Опции полного расчёта спецификации (ТНП BOM).

    Параметры, которых пока нет в карточке объекта, берутся с дефолтами и могут
    переопределяться сотрудником на странице спецификации.
    """

    reserve_coefficient: float = Field(
        default=1.0,
        ge=1.0,
        le=3.0,
        description="R,гр — коэффициент горячего резервирования секций",
    )
    ex_zone: bool = Field(
        default=False,
        description="Ex — взрывоопасная зона (бронированный кабельный ввод вместо пластикового)",
    )
    indication_on_boxes: bool = Field(
        default=False, description="К1i — индикация питания на коробках"
    )
    end_section_indication: bool = Field(
        default=False, description="К2i — доп. индикация в конце нагревательной секции"
    )
    top_indication: bool = Field(
        default=False, description="Кiu — доп. индикация сверху коробки"
    )
    min_length_for_end_indication: float = Field(
        default=0.0,
        ge=0.0,
        description="L,К2i — мин. длина секции для применения К2i, м",
    )


class SpecificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    variant_number: int
    electrical_variant_id: UUID | None = None
    items: list[dict[str, Any]]
    # Режим и опции последней генерации — чтобы UI восстанавливал их после reload
    generation_mode: str | None = None
    generation_options: dict[str, Any] | None = None
    is_stale: bool
    stale_reason: str | None = None
    stale_at: datetime | None = None
    stale_details: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class SpecificationGenerateRequest(BaseModel):
    """Тело запроса генерации спецификации.

    mode='basic' — кабель + минимум аксессуаров;
    mode='full' — полный условный BOM по ТНП (PDL-ER-04: доступен и гостю).

    electrical_variant_ids — явный список UUID ЭР (PDL-ER-01). UI «Выбрать все»
    разворачивается в полный список текущих UUID, а не в implicit all-on-open.
    """

    mode: str = Field(default="basic", pattern="^(basic|full)$")
    options: SpecificationOptions | None = None
    electrical_variant_ids: list[UUID] | None = Field(
        default=None,
        max_length=5,
        description="Явно выбранные UUID ЭР (1…5). Пустой/None — legacy single slot.",
    )


class SpecificationGenerateVariantResult(BaseModel):
    electrical_variant_id: UUID
    items: list[SpecificationItem]
    mode: str = "basic"
    skipped_objects: int = 0


class SpecificationGenerateResponse(BaseModel):
    project_id: UUID
    items: list[SpecificationItem]
    # Фактически применённый режим генерации
    mode: str = "basic"
    # Объекты проекта без успешного электрорасчёта, не вошедшие в полный BOM.
    # В basic-режиме всегда 0: там аксессуары заказываются на все объекты.
    skipped_objects: int = 0
    electrical_variant_id: UUID | None = None
    # Multi-ЭР atomic generation: per-variant results (PDL-ER-01/14).
    results: list[SpecificationGenerateVariantResult] | None = None


class SpecificationUpdateRequest(BaseModel):
    items: list[SpecificationItem]
