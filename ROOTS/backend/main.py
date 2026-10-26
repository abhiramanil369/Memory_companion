from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database.database import Base, engine
from database import models

from routers.memories import router as memories_router
from routers.moods import router as moods_router
from routers.games import router as games_router
from routers.capsules import router as capsules_router
from routers.ai import router as ai_router


# ============================================================
# DATABASE INITIALIZATION
# ============================================================

Base.metadata.create_all(
    bind=engine
)

try:
    from sqlalchemy import text
    with engine.connect() as conn:
        res = conn.execute(text("PRAGMA table_info(memories)")).fetchall()
        col_names = [row[1] for row in res]
        if "capsule_id" not in col_names and "id" in col_names:
            conn.execute(text("ALTER TABLE memories ADD COLUMN capsule_id INTEGER REFERENCES capsules(id)"))
            conn.commit()
except Exception as e:
    print(f"Migration notice: {e}")

try:
    from seed_games import seed_games
    seed_games()
except Exception:
    pass


# ============================================================
# FASTAPI APPLICATION
# ============================================================

app = FastAPI(
    title="ROOTS Memory OS API",
    version="1.0.0",
)


# ============================================================
# CORS CONFIGURATION
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# MODULE 1 — MEMORY MANAGEMENT
# ============================================================

app.include_router(
    memories_router
)


# ============================================================
# MODULE 2 — MOOD TRACKING
# ============================================================

app.include_router(
    moods_router
)


# ============================================================
# MODULE 3 — CONNECTION GAMES
# ============================================================

app.include_router(
    games_router
)


# ============================================================
# MODULE 4 — MEMORY CAPSULES
# ============================================================

app.include_router(
    capsules_router
)


# ============================================================
# MODULE 5 — AI & INTELLIGENCE ENGINE
# ============================================================

app.include_router(
    ai_router
)


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get(
    "/health",
    tags=["health"],
)
def health_check():
    return {
        "status": "ok"
    }