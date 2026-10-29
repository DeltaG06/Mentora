"""External trigger for the scheduled jobs (fallback for sleeping hosts).

An external cron (e.g. cron-job.org) calls this with the X-Job-Secret header;
there is no user token. The endpoint is disabled while JOB_SECRET is unset.
"""

import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import get_db
from app.jobs import run_daily_jobs, run_reminder_job
from app.schemas.notification import JobRunOut

router = APIRouter(tags=["jobs"])


@router.post("/admin/jobs/run", response_model=JobRunOut)
def run_jobs(
    x_job_secret: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> JobRunOut:
    if not settings.JOB_SECRET:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not Found")
    if x_job_secret is None or not secrets.compare_digest(
        x_job_secret, settings.JOB_SECRET
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid job secret")
    # Both jobs are idempotent, so running them on every ping is safe.
    return JobRunOut(**run_daily_jobs(db), **run_reminder_job(db))
