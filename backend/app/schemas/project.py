"""Схемы проектов и объектов проекта."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProjectBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    task_number: str | None = Field(default=None, max_length=64)


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    task_number: str | None = Field(default=None, max_length=64)
    status: str | None = Field(default=None, pattern="^(draft|completed)$")


class ProjectResponse(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID | None
    session_id: str | None
    status: str
    owner_email: str | None = None
    object_types: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ProjectObjectBase(BaseModel):
    object_type: str = Field(pattern="^(pipe|tank|pump|platform|other)$")
    sort_order: int = 0
    params: dict[str, Any] = Field(default_factory=dict)


class ProjectObjectCreate(ProjectObjectBase):
    pass


class ProjectObjectUpdate(BaseModel):
    version: int = Field(ge=1)
    params: dict[str, Any] | None = None
    sort_order: int | None = None


class ProjectObjectResponse(ProjectObjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    version: int
    results: dict[str, Any] | None
    is_valid: bool
    validation_errors: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime


class ProjectObjectsSummaryResponse(BaseModel):
    total: int = 0
    valid: int = 0
    invalid: int = 0
    by_type: dict[str, int] = Field(default_factory=dict)
    valid_by_type: dict[str, int] = Field(default_factory=dict)
    electrical_calculations_total: int = 0
    successful_electrical_calculations: int = 0
    failed_electrical_calculations: int = 0
    objects_with_successful_electrical_calculation: int = 0


class ReorderRequest(BaseModel):
    order: list[UUID]


ObjectQueryType = Literal["pipe", "tank"]
ObjectQueryFilterOp = Literal["contains", "range", "in", "equals"]
ObjectQuerySortDir = Literal["asc", "desc"]


class ObjectQuerySearch(BaseModel):
    text: str = Field(default="", max_length=120)
    columns: list[str] | None = None


class ObjectQueryFilter(BaseModel):
    key: str
    op: ObjectQueryFilterOp
    value: Any | None = None
    values: list[Any] | None = None
    min: float | None = None
    max: float | None = None
    include_empty: bool = False


class ObjectQuerySort(BaseModel):
    key: str
    dir: ObjectQuerySortDir = "asc"


class ProjectObjectsQueryRequest(BaseModel):
    object_type: ObjectQueryType
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=200)
    search: ObjectQuerySearch | None = None
    filters: list[ObjectQueryFilter] = Field(default_factory=list, max_length=20)
    sort: ObjectQuerySort | None = None


class ProjectObjectsPageCursor(BaseModel):
    sort_order: int
    id: UUID
    key: str | None = None
    value: Any | None = None
    value_is_null: bool = False


class ProjectObjectsPageInfo(BaseModel):
    page: int
    page_size: int
    offset: int
    total_pages: int
    has_next_page: bool
    has_previous_page: bool
    next_cursor: ProjectObjectsPageCursor | None = None


class ProjectObjectsQueryCounts(BaseModel):
    total: int
    by_type: dict[str, int]
    filtered: int


class ProjectObjectsQueryEcho(BaseModel):
    object_type: ObjectQueryType
    sort: ObjectQuerySort | None = None


class ProjectObjectsQueryResponse(BaseModel):
    items: list[ProjectObjectResponse]
    page_info: ProjectObjectsPageInfo
    counts: ProjectObjectsQueryCounts
    query: ProjectObjectsQueryEcho


class ObjectQueryOptionItem(BaseModel):
    value: Any
    label: str


class ObjectQueryFieldOptions(BaseModel):
    mode: Literal["inline", "dictionary", "project_values", "derived"]
    items: list[ObjectQueryOptionItem] = Field(default_factory=list)
    include_empty: bool = False


class ObjectQueryFieldFilterCapability(BaseModel):
    enabled: bool
    ops: list[ObjectQueryFilterOp] = Field(default_factory=list)
    include_empty: bool = False
    reason: str | None = None


class ObjectQueryFieldSortCapability(BaseModel):
    enabled: bool
    type: Literal["text", "number", "label", "enum_rank"] | None = None
    nulls: Literal["last"] | None = None
    collation: str | None = None
    reason: str | None = None


class ObjectQueryFieldCapability(BaseModel):
    key: str
    label: str
    title: str
    data_type: Literal["display", "text", "number", "enum", "boolean"]
    unit: str | None = None
    filter: ObjectQueryFieldFilterCapability
    sort: ObjectQueryFieldSortCapability
    options: ObjectQueryFieldOptions | None = None


class ObjectQueryDefaultSort(BaseModel):
    key: str
    dir: ObjectQuerySortDir


class ObjectQuerySearchCapability(BaseModel):
    enabled: bool
    max_text_length: int
    default_columns: list[str]


class ObjectQueryCapabilitiesResponse(BaseModel):
    version: int
    object_type: ObjectQueryType
    default_page_size: int
    max_page_size: int
    default_sort: ObjectQueryDefaultSort
    search: ObjectQuerySearchCapability
    fields: list[ObjectQueryFieldCapability]
