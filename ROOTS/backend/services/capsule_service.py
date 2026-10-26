import random
import string
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from database.models import Capsule, Memory
from schemas.capsule import CapsuleCreate


def generate_invite_code(db: Session) -> str:
    """Generate a unique 6-8 character human-friendly invite code."""
    while True:
        suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
        code = f"ROOT-{suffix}"
        existing = db.scalar(
            select(Capsule).where(Capsule.invite_code == code)
        )
        if not existing:
            return code


def create_capsule(db: Session, capsule_data: CapsuleCreate) -> dict:
    code = generate_invite_code(db)
    capsule = Capsule(
        title=capsule_data.title.strip(),
        description=capsule_data.description.strip() if capsule_data.description else None,
        invite_code=code,
    )
    db.add(capsule)
    db.commit()
    db.refresh(capsule)
    return {
        "id": capsule.id,
        "title": capsule.title,
        "description": capsule.description,
        "invite_code": capsule.invite_code,
        "created_at": capsule.created_at,
        "memory_count": 0,
    }


def list_capsules(db: Session) -> list[dict]:
    statement = select(Capsule).order_by(Capsule.created_at.desc(), Capsule.id.desc())
    capsules = db.scalars(statement).all()

    results = []
    for cap in capsules:
        mem_count = db.scalar(
            select(func.count(Memory.id)).where(Memory.capsule_id == cap.id)
        ) or 0
        results.append({
            "id": cap.id,
            "title": cap.title,
            "description": cap.description,
            "invite_code": cap.invite_code,
            "created_at": cap.created_at,
            "memory_count": mem_count,
        })
    return results


def get_capsule(db: Session, capsule_id: int) -> dict | None:
    cap = db.get(Capsule, capsule_id)
    if not cap:
        return None

    mem_count = db.scalar(
        select(func.count(Memory.id)).where(Memory.capsule_id == cap.id)
    ) or 0

    return {
        "id": cap.id,
        "title": cap.title,
        "description": cap.description,
        "invite_code": cap.invite_code,
        "created_at": cap.created_at,
        "memory_count": mem_count,
    }


def get_capsule_by_code(db: Session, invite_code: str) -> dict | None:
    normalized = invite_code.strip().upper()
    cap = db.scalar(
        select(Capsule).where(Capsule.invite_code == normalized)
    )
    if not cap and not normalized.startswith("ROOT-"):
        cap = db.scalar(
            select(Capsule).where(Capsule.invite_code == f"ROOT-{normalized}")
        )
    if not cap:
        return None

    mem_count = db.scalar(
        select(func.count(Memory.id)).where(Memory.capsule_id == cap.id)
    ) or 0

    return {
        "id": cap.id,
        "title": cap.title,
        "description": cap.description,
        "invite_code": cap.invite_code,
        "created_at": cap.created_at,
        "memory_count": mem_count,
    }


def get_capsule_memories(db: Session, capsule_id: int) -> list[Memory]:
    statement = (
        select(Memory)
        .where(Memory.capsule_id == capsule_id)
        .order_by(Memory.created_at.desc(), Memory.id.desc())
    )
    return list(db.scalars(statement).all())
