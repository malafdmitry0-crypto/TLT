"""Сервис администрирования: пользователи, коэффициенты, расширенные БД."""

from typing import ClassVar
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password_async
from app.models.accessory import AccessoryExtended
from app.models.cable import CableExtended
from app.models.coefficient import CorrectionCoefficient
from app.models.user import User
from app.schemas.coefficient import CoefficientCreate, CoefficientUpdate
from app.schemas.reference import (
    AccessoryExtendedCreate,
    AccessoryExtendedUpdate,
    CableExtendedCreate,
    CableExtendedUpdate,
)
from app.schemas.user import UserCreate, UserUpdate


class AdminError(Exception):
    pass


class CoefficientNotFoundError(AdminError):
    pass


class AdminService:
    _RETIRED_HEAT_LOSS_COEFFICIENTS: ClassVar[set[str]] = {
        "wind_factor",
        "location_indoor",
        "location_outdoor",
    }

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ---- Users ----

    async def list_users(self) -> list[User]:
        result = await self.db.execute(select(User).order_by(User.created_at))
        return list(result.scalars().all())

    async def create_user(self, data: UserCreate) -> User:
        existing = await self.db.execute(select(User).where(User.email == data.email))
        if existing.scalar_one_or_none() is not None:
            raise AdminError(f"Пользователь {data.email} уже существует")
        user = User(
            email=data.email,
            hashed_password=await hash_password_async(data.password),
            full_name=data.full_name,
            role=data.role,
            is_active=True,
        )
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def update_user(self, user_id: UUID, data: UserUpdate) -> User:
        user = await self._get_user(user_id)
        upd = data.model_dump(exclude_unset=True)
        if upd.get("password"):
            user.hashed_password = await hash_password_async(upd.pop("password"))
        for k, v in upd.items():
            setattr(user, k, v)
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def deactivate_user(self, user_id: UUID) -> User:
        user = await self._get_user(user_id)
        user.is_active = False
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def _get_user(self, user_id: UUID) -> User:
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise AdminError("Пользователь не найден")
        return user

    # ---- Coefficients ----

    async def list_coefficients(self) -> list[CorrectionCoefficient]:
        result = await self.db.execute(
            select(CorrectionCoefficient).where(
                CorrectionCoefficient.key.not_in(self._RETIRED_HEAT_LOSS_COEFFICIENTS)
            )
        )
        return list(result.scalars().all())

    async def update_coefficient(
        self, key: str, data: CoefficientUpdate, user_id: UUID | None
    ) -> CorrectionCoefficient:
        if key in self._RETIRED_HEAT_LOSS_COEFFICIENTS:
            raise AdminError(f"Коэффициент {key} выведен из расчётного контура ТНП")
        result = await self.db.execute(
            select(CorrectionCoefficient).where(CorrectionCoefficient.key == key)
        )
        coeff = result.scalar_one_or_none()
        if coeff is None:
            raise CoefficientNotFoundError(f"Коэффициент {key} не найден")
        coeff.value = data.value
        if data.description is not None:
            coeff.description = data.description
        coeff.updated_by = user_id
        await self.db.commit()
        await self.db.refresh(coeff)
        # Инвалидируем кэш — следующий recalculate увидит новое значение
        from app.core.cache import cache

        await cache.ainvalidate("coefficients")
        return coeff

    async def create_coefficient(
        self, data: CoefficientCreate, user_id: UUID | None
    ) -> CorrectionCoefficient:
        if data.key in self._RETIRED_HEAT_LOSS_COEFFICIENTS:
            raise AdminError(f"Коэффициент {data.key} выведен из расчётного контура ТНП")
        result = await self.db.execute(
            select(CorrectionCoefficient).where(CorrectionCoefficient.key == data.key)
        )
        if result.scalar_one_or_none() is not None:
            raise AdminError(f"Коэффициент {data.key} уже существует")
        coeff = CorrectionCoefficient(
            key=data.key,
            value=data.value,
            description=data.description,
            updated_by=user_id,
        )
        self.db.add(coeff)
        await self.db.commit()
        await self.db.refresh(coeff)
        from app.core.cache import cache

        await cache.ainvalidate("coefficients")
        return coeff

    # ---- Cables ----

    async def list_cables(self) -> list[CableExtended]:
        result = await self.db.execute(select(CableExtended))
        return list(result.scalars().all())

    async def create_cable(self, data: CableExtendedCreate) -> CableExtended:
        cable = CableExtended(**data.model_dump())
        self.db.add(cable)
        await self.db.commit()
        await self.db.refresh(cable)
        return cable

    async def update_cable(self, cable_id: UUID, data: CableExtendedUpdate) -> CableExtended:
        result = await self.db.execute(select(CableExtended).where(CableExtended.id == cable_id))
        cable = result.scalar_one_or_none()
        if cable is None:
            raise AdminError("Кабель не найден")
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(cable, k, v)
        await self.db.commit()
        await self.db.refresh(cable)
        return cable

    async def delete_cable(self, cable_id: UUID) -> None:
        result = await self.db.execute(select(CableExtended).where(CableExtended.id == cable_id))
        cable = result.scalar_one_or_none()
        if cable is None:
            raise AdminError("Кабель не найден")
        await self.db.delete(cable)
        await self.db.commit()

    # ---- Accessories ----

    async def list_accessories(self) -> list[AccessoryExtended]:
        result = await self.db.execute(select(AccessoryExtended))
        return list(result.scalars().all())

    async def create_accessory(self, data: AccessoryExtendedCreate) -> AccessoryExtended:
        acc = AccessoryExtended(**data.model_dump())
        self.db.add(acc)
        await self.db.commit()
        await self.db.refresh(acc)
        return acc

    async def update_accessory(
        self, acc_id: UUID, data: AccessoryExtendedUpdate
    ) -> AccessoryExtended:
        result = await self.db.execute(
            select(AccessoryExtended).where(AccessoryExtended.id == acc_id)
        )
        acc = result.scalar_one_or_none()
        if acc is None:
            raise AdminError("Аксессуар не найден")
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(acc, k, v)
        await self.db.commit()
        await self.db.refresh(acc)
        return acc

    async def delete_accessory(self, acc_id: UUID) -> None:
        result = await self.db.execute(
            select(AccessoryExtended).where(AccessoryExtended.id == acc_id)
        )
        acc = result.scalar_one_or_none()
        if acc is None:
            raise AdminError("Аксессуар не найден")
        await self.db.delete(acc)
        await self.db.commit()
