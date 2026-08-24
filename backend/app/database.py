from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.models.base import Base

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
