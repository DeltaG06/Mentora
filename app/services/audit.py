from sqlalchemy.orm import Session

from app.models.system import AuditLog


def log_action(
    db: Session,
    *,
    actor_id: int | None,
    action: str,
    entity: str,
    entity_id: int,
    details: str | None = None,
) -> AuditLog:
    """Add an audit_log row to the session.

    The caller commits, so the row is written atomically with the change it
    records.
    """
    entry = AuditLog(
        actor_id=actor_id,
        action=action,
        entity=entity,
        entity_id=entity_id,
        details=details,
    )
    db.add(entry)
    return entry
