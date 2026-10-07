"""Flag endpoints: a thin HTTP layer over app.services.flag_engine."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, require_roles
from app.db import get_db
from app.models.enums import FlagRule, FlagStatus, UserRole
from app.models.flag import Flag
from app.models.user import User
from app.schemas.flag import FlagListOut, FlagOut, FlagResolve
from app.services import flag_engine
from app.services.allocations import active_mentee_ids, is_active_mentee
from app.services.audit import log_action

router = APIRouter(tags=["flags"])


def paginate(db: Session, query: Select, page: int, page_size: int) -> FlagListOut:
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    flags = db.scalars(
        query.options(joinedload(Flag.student), joinedload(Flag.semester))
        .order_by(Flag.raised_at.desc(), Flag.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return FlagListOut(items=flags, total=total, page=page, page_size=page_size)


def apply_filters(
    query: Select,
    status_: FlagStatus | None,
    rule: FlagRule | None,
    semester_id: int | None,
) -> Select:
    if status_ is not None:
        query = query.where(Flag.status == status_)
    if rule is not None:
        query = query.where(Flag.rule == rule)
    if semester_id is not None:
        query = query.where(Flag.semester_id == semester_id)
    return query


def get_visible_flag(db: Session, flag_id: int, user: User) -> Flag:
    """The flag if this user may see it; 404 otherwise (never 403)."""
    flag = db.get(Flag, flag_id)
    if flag is not None:
        if user.role == UserRole.admin:
            return flag
        if user.role == UserRole.student and flag.student_id == user.id:
            return flag
        if user.role == UserRole.mentor and is_active_mentee(
            db, user.id, flag.student_id
        ):
            return flag
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Flag not found")


@router.get("/students/me/flags", response_model=FlagListOut)
def my_flags(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    student: User = Depends(require_roles(UserRole.student)),
    db: Session = Depends(get_db),
) -> FlagListOut:
    query = select(Flag).where(Flag.student_id == student.id)
    return paginate(db, query, page, page_size)


@router.get("/mentor/flags", response_model=FlagListOut)
def mentee_flags(
    status_: FlagStatus | None = Query(default=None, alias="status"),
    rule: FlagRule | None = None,
    semester_id: int | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    mentor: User = Depends(require_roles(UserRole.mentor)),
    db: Session = Depends(get_db),
) -> FlagListOut:
    query = select(Flag).where(Flag.student_id.in_(active_mentee_ids(mentor.id)))
    query = apply_filters(query, status_, rule, semester_id)
    return paginate(db, query, page, page_size)


@router.get("/admin/flags", response_model=FlagListOut)
def all_flags(
    status_: FlagStatus | None = Query(default=None, alias="status"),
    rule: FlagRule | None = None,
    semester_id: int | None = None,
    escalated: bool | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _admin: User = Depends(require_roles(UserRole.admin)),
    db: Session = Depends(get_db),
) -> FlagListOut:
    query = apply_filters(select(Flag), status_, rule, semester_id)
    if escalated is True:
        query = query.where(Flag.status == FlagStatus.escalated)
    elif escalated is False:
        query = query.where(Flag.status != FlagStatus.escalated)
    return paginate(db, query, page, page_size)


@router.get("/flags/{flag_id}", response_model=FlagOut)
def flag_detail(
    flag_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Flag:
    return get_visible_flag(db, flag_id, user)


@router.post("/flags/{flag_id}/resolve", response_model=FlagOut)
def resolve(
    flag_id: int,
    payload: FlagResolve,
    user: User = Depends(require_roles(UserRole.mentor, UserRole.admin)),
    db: Session = Depends(get_db),
) -> Flag:
    flag = get_visible_flag(db, flag_id, user)
    try:
        flag_engine.resolve_flag(db, flag, payload.resolution_note, user)
    except flag_engine.EmptyResolutionNote as error:
        raise HTTPException(422, str(error))
    except flag_engine.FlagAlreadyResolved as error:
        raise HTTPException(status.HTTP_409_CONFLICT, str(error))

    log_action(
        db,
        actor_id=user.id,
        action="flag.resolve",
        entity="flag",
        entity_id=flag.id,
        details=flag.resolution_note,
    )
    db.commit()
    db.refresh(flag)
    return flag
