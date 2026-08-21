"""Seed demo accounts and resolve the administrative principal."""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.core.security import hash_password
from app.models.user import User
from app.seeds.loader import load_users

logger = logging.getLogger("seeds")


async def seed_users(db: AsyncSession) -> list[User]:
    users: list[User] = []
    for seed in load_users():
        result = await db.execute(select(User).where(User.email == seed.email))
        user = result.scalar_one_or_none()
        if user is None:
            user = User(
                email=seed.email,
                hashed_password=hash_password(seed.password),
                full_name=seed.full_name,
                role=seed.role,
                is_active=seed.is_active,
            )
            db.add(user)
            logger.info("  + user %s (%s)", seed.email, seed.role)
        users.append(user)
    await db.flush()
    return users


async def existing_admin_principal(db: AsyncSession) -> CurrentPrincipal:
    admin = await db.scalar(select(User).where(User.role == "admin").limit(1))
    if admin is None:
        raise RuntimeError("Catalog registration requires an admin principal")
    return CurrentPrincipal(role="admin", user_id=admin.id, email=admin.email)
