import json
from decimal import Decimal

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.common import (
    LIVE_STATUSES,
    ensure_editable,
    ensure_pending,
    get_mentee_record_or_404,
    get_open_semester,
    get_own_or_404,
)
from app.api.deps import get_current_user, require_roles
from app.db import get_db
from app.models.academics import ResultSubject, SemesterResult
from app.models.enums import SubmissionStatus, UserRole
from app.models.types import utcnow
from app.models.user import User
from app.schemas.submission import (
    RejectRequest,
    ResultOut,
    ResultSubjectsIn,
    ResultVerifyOut,
)
from app.services import flag_engine, notifications, proof_storage
from app.services.allocations import active_mentee_ids, is_active_mentee
from app.services.audit import log_action
from app.services.notifications import create_notification

router = APIRouter(tags=["semester results"])

require_student = require_roles(UserRole.student)
require_mentor = require_roles(UserRole.mentor)

WHAT = "Result"
LIVE_EXISTS = "A pending or verified result already exists for this semester"


def parse_subjects(raw: str) -> list[ResultSubject]:
    """Parse the `subjects` form field: a JSON array string."""
    try:
        parsed = ResultSubjectsIn.model_validate({"subjects": json.loads(raw)})
    except json.JSONDecodeError:
        raise HTTPException(422, "subjects must be a JSON array")
    except ValidationError as error:
        first = error.errors()[0]
        location = ".".join(str(part) for part in first["loc"])
        raise HTTPException(422, f"Invalid subjects ({location}): {first['msg']}")
    return [
        ResultSubject(
            subject_name=subject.subject_name,
            final_marks=subject.final_marks,
            max_marks=subject.max_marks,
        )
        for subject in parsed.subjects
    ]


def store_proof(upload: UploadFile) -> str:
    try:
        return proof_storage.save_proof(
            upload.filename, proof_storage.read_upload(upload)
        )
    except proof_storage.ProofTooLarge as error:
        raise HTTPException(413, str(error))
    except proof_storage.InvalidProofType as error:
        raise HTTPException(422, str(error))


def proof_response(result: SemesterResult) -> FileResponse:
    path = proof_storage.proof_path(result.proof_url)
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proof file not found")
    return FileResponse(path, media_type=proof_storage.media_type(result.proof_url))


# --- student ----------------------------------------------------------------


@router.post(
    "/students/me/results", response_model=ResultOut, status_code=status.HTTP_201_CREATED
)
def submit(
    semester_id: int = Form(),
    sgpa: Decimal = Form(ge=0, le=10, decimal_places=2),
    subjects: str = Form(),
    proof_file: UploadFile = File(),
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> SemesterResult:
    """Upload a semester result. The body is multipart/form-data.

    `subjects` is a single form field holding a JSON array string, e.g.
    `[{"subject_name": "DSA", "final_marks": 72, "max_marks": 100}]`
    (`max_marks` defaults to 100). `proof_file` is a PDF, JPG or PNG of at
    most 5 MB.
    """
    result_subjects = parse_subjects(subjects)
    semester = get_open_semester(db, semester_id)

    # Rejected results are history and do not block a re-upload.
    live = db.scalar(
        select(SemesterResult.id).where(
            SemesterResult.student_id == student.id,
            SemesterResult.semester_id == semester.id,
            SemesterResult.status.in_(LIVE_STATUSES),
        )
    )
    if live is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, LIVE_EXISTS)

    proof = store_proof(proof_file)
    result = SemesterResult(
        student_id=student.id,
        semester_id=semester.id,
        sgpa=sgpa,
        status=SubmissionStatus.pending,
        proof_url=proof,
        subjects=result_subjects,
    )
    db.add(result)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        proof_storage.delete_proof(proof)
        raise HTTPException(status.HTTP_409_CONFLICT, LIVE_EXISTS)
    db.refresh(result)
    return result


@router.patch("/students/me/results/{result_id}", response_model=ResultOut)
def edit(
    result_id: int,
    sgpa: Decimal | None = Form(default=None, ge=0, le=10, decimal_places=2),
    subjects: str | None = Form(default=None),
    proof_file: UploadFile | None = File(default=None),
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> SemesterResult:
    """Edit a pending result. multipart/form-data; every field is optional.

    `subjects` (JSON array string, as in the upload) replaces the subject
    list. A new `proof_file` replaces the old file, which is deleted from disk.
    """
    result = get_own_or_404(db, SemesterResult, result_id, student, WHAT)
    ensure_editable(result)

    if sgpa is not None:
        result.sgpa = sgpa
    if subjects is not None:
        new_subjects = parse_subjects(subjects)
        # Flush the deletes first so a re-used subject name cannot collide.
        result.subjects.clear()
        db.flush()
        result.subjects.extend(new_subjects)

    old_proof = None
    if proof_file is not None:
        old_proof = result.proof_url
        result.proof_url = store_proof(proof_file)

    db.commit()
    if old_proof is not None:
        proof_storage.delete_proof(old_proof)
    db.refresh(result)
    return result


@router.get("/students/me/results", response_model=list[ResultOut])
def my_results(
    semester_id: int | None = None,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> list[SemesterResult]:
    query = select(SemesterResult).where(SemesterResult.student_id == student.id)
    if semester_id is not None:
        query = query.where(SemesterResult.semester_id == semester_id)
    return db.scalars(query.order_by(SemesterResult.id.desc())).all()


# --- mentor -----------------------------------------------------------------


@router.get("/mentor/results", response_model=list[ResultOut])
def queue(
    status_: SubmissionStatus = Query(default=SubmissionStatus.pending, alias="status"),
    mentor: User = Depends(require_mentor),
    db: Session = Depends(get_db),
) -> list[SemesterResult]:
    return db.scalars(
        select(SemesterResult)
        .where(
            SemesterResult.student_id.in_(active_mentee_ids(mentor.id)),
            SemesterResult.status == status_,
        )
        .order_by(SemesterResult.id)
    ).all()


@router.get("/mentor/results/{result_id}", response_model=ResultOut)
def detail(
    result_id: int,
    mentor: User = Depends(require_mentor),
    db: Session = Depends(get_db),
) -> SemesterResult:
    return get_mentee_record_or_404(db, SemesterResult, result_id, mentor, WHAT)


@router.get("/mentor/results/{result_id}/proof", response_class=FileResponse)
def mentor_proof(
    result_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    # Anyone but the assigned mentor gets 404, whatever their role.
    result = db.get(SemesterResult, result_id)
    if (
        result is None
        or user.role != UserRole.mentor
        or not is_active_mentee(db, user.id, result.student_id)
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{WHAT} not found")
    return proof_response(result)


@router.get("/admin/results/{result_id}/proof", response_class=FileResponse)
def admin_proof(
    result_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    result = db.get(SemesterResult, result_id)
    if result is None or user.role != UserRole.admin:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{WHAT} not found")
    return proof_response(result)


@router.post("/mentor/results/{result_id}/verify", response_model=ResultVerifyOut)
def verify(
    result_id: int,
    mentor: User = Depends(require_mentor),
    db: Session = Depends(get_db),
) -> ResultVerifyOut:
    result = get_mentee_record_or_404(db, SemesterResult, result_id, mentor, WHAT)
    ensure_pending(result)

    result.status = SubmissionStatus.verified
    result.verified_by = mentor.id
    result.verified_at = utcnow()

    flags = flag_engine.on_result_verified(db, result)
    log_action(
        db,
        actor_id=mentor.id,
        action="semester_result.verify",
        entity="semester_result",
        entity_id=result.id,
        details=f"flags raised: {len(flags)}",
    )
    db.commit()
    db.refresh(result)
    return ResultVerifyOut(result=result, flags_raised=flags)


@router.post("/mentor/results/{result_id}/reject", response_model=ResultOut)
def reject(
    result_id: int,
    payload: RejectRequest,
    mentor: User = Depends(require_mentor),
    db: Session = Depends(get_db),
) -> SemesterResult:
    result = get_mentee_record_or_404(db, SemesterResult, result_id, mentor, WHAT)
    ensure_pending(result)

    result.status = SubmissionStatus.rejected
    result.rejection_note = payload.note
    create_notification(
        db,
        result.student_id,
        "Semester result rejected",
        f"{result.semester.label}: {payload.note}",
        notifications.SUBMISSION_REJECTED,
    )
    db.commit()
    db.refresh(result)
    return result
