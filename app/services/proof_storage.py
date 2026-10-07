"""Proof file storage for semester results.

Files live under <UPLOAD_DIR>/proofs/ and are never served statically; the
only way out is the authorised /proof endpoints. The database stores the path
relative to UPLOAD_DIR (e.g. 'proofs/3f2a....pdf').
"""

import uuid
from pathlib import Path, PurePosixPath

from app.core.config import settings

PROOF_SUBDIR = "proofs"
MAX_PROOF_BYTES = 5 * 1024 * 1024

# extension -> (content type, magic bytes the file must start with)
ALLOWED_TYPES = {
    ".pdf": ("application/pdf", b"%PDF-"),
    ".jpg": ("image/jpeg", b"\xff\xd8\xff"),
    ".jpeg": ("image/jpeg", b"\xff\xd8\xff"),
    ".png": ("image/png", b"\x89PNG\r\n\x1a\n"),
}


class InvalidProofType(ValueError):
    """The upload is not a PDF, JPG or PNG."""


class ProofTooLarge(ValueError):
    """The upload exceeds MAX_PROOF_BYTES."""


def read_upload(upload) -> bytes:
    """Read an UploadFile, refusing anything over the size limit."""
    data = upload.file.read(MAX_PROOF_BYTES + 1)
    if len(data) > MAX_PROOF_BYTES:
        raise ProofTooLarge("Proof file must be 5 MB or smaller")
    return data


def save_proof(filename: str | None, data: bytes) -> str:
    """Validate and store a proof file; return its path relative to UPLOAD_DIR."""
    extension = Path(filename or "").suffix.lower()
    allowed = ALLOWED_TYPES.get(extension)
    # The extension alone is not trusted: the content must match it.
    if allowed is None or not data.startswith(allowed[1]):
        raise InvalidProofType("Proof file must be a PDF, JPG or PNG")

    relative = PurePosixPath(PROOF_SUBDIR) / f"{uuid.uuid4().hex}{extension}"
    target = Path(settings.UPLOAD_DIR) / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return relative.as_posix()


def proof_path(relative: str) -> Path:
    return Path(settings.UPLOAD_DIR) / relative


def media_type(relative: str) -> str:
    return ALLOWED_TYPES[Path(relative).suffix.lower()][0]


def delete_proof(relative: str) -> None:
    proof_path(relative).unlink(missing_ok=True)
