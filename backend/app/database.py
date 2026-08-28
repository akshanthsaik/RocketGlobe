import shutil
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.models.base import Base

_SEED_DB_PATH = Path(__file__).resolve().parents[1] / "seed_data" / "rocketglobe_seed.db"


def seed_if_missing() -> None:
    """On a brand-new install with no database file yet, start from the
    committed offline snapshot instead of an empty schema, so the app has
    data without requiring a first-time live LL2 sync (the anonymous LL2
    tier's ~15 requests/hour makes a full first sync impractical). Never
    touches an existing database file, synced or not.
    """
    if not settings.DATABASE_URL.startswith("sqlite:///"):
        return
    db_path = Path(settings.DATABASE_URL.removeprefix("sqlite:///"))
    if db_path.exists() or not _SEED_DB_PATH.exists():
        return
    db_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(_SEED_DB_PATH, db_path)
    print(f"Seeded {db_path} from offline snapshot {_SEED_DB_PATH}")


_is_sqlite = settings.DATABASE_URL.startswith("sqlite")

# check_same_thread=False: FastAPI/uvicorn serve each request on a worker thread,
# but a given SQLAlchemy Session is only ever used by the thread that created it.
engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.SQL_ECHO,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
)

if _is_sqlite:

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection, _):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Dependency for FastAPI routes"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables"""
    Base.metadata.create_all(bind=engine)
    print("Database tables created")
