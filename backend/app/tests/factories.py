"""Фабрики тестовых данных (factory-boy).

factory-boy работает с синхронными сессиями, поэтому здесь — вспомогательные
функции, а не SQLAlchemy-фабрики. Для интеграционных тестов удобнее вручную
создавать объекты через фикстуры.
"""

import factory

from app.models.project import Project
from app.models.user import User


class UserFactory(factory.Factory):
    class Meta:
        model = User

    email = factory.Sequence(lambda n: f"user{n}@test.com")
    hashed_password = "$2b$12$abcdefghijklmnopqrstuv"
    full_name = factory.Faker("name")
    role = "employee"
    is_active = True


class ProjectFactory(factory.Factory):
    class Meta:
        model = Project

    name = factory.Sequence(lambda n: f"Проект {n}")
    description = factory.Faker("sentence")
    status = "draft"
