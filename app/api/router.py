from fastapi import APIRouter

from app.api.routes import (
    admin_users,
    allocations,
    auth,
    flags,
    group_sessions,
    internal_submissions,
    jobs,
    meetings,
    notifications,
    results,
    semesters,
    users,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(admin_users.router)
api_router.include_router(allocations.admin_router)
api_router.include_router(allocations.student_router)
api_router.include_router(semesters.router)
api_router.include_router(internal_submissions.router)
api_router.include_router(results.router)
api_router.include_router(flags.router)
api_router.include_router(meetings.router)
api_router.include_router(group_sessions.router)
api_router.include_router(notifications.router)
api_router.include_router(jobs.router)
