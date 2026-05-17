"""Корневой роутер API v1."""

from fastapi import APIRouter

from app.api.v1 import (
    admin,
    audit,
    auth,
    calc_jobs,
    calculations,
    objects,
    preferences,
    projects,
    references,
    reports,
    specifications,
)

api_router = APIRouter()
api_router.include_router(audit.router, prefix="/audit", tags=["audit"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(objects.router, prefix="/projects", tags=["objects"])
api_router.include_router(calculations.router, prefix="/calc", tags=["calc"])
api_router.include_router(calc_jobs.router, prefix="/calc", tags=["calc"])
api_router.include_router(specifications.router, prefix="/specifications", tags=["specifications"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(references.router, prefix="/references", tags=["references"])
api_router.include_router(preferences.router, prefix="/preferences", tags=["preferences"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
