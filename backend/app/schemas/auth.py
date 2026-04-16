"""Схемы авторизации."""

from pydantic import BaseModel, EmailStr, Field

from app.schemas.project import ProjectResponse


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class GuestSessionResponse(BaseModel):
    session_id: str
    project: ProjectResponse  # единственный авто-проект пользователя
