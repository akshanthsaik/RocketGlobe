import uvicorn

from app.config import settings
from app.main import app

if __name__ == "__main__":
    uvicorn.run(
        app,
        host=settings.API_HOST,
        port=settings.API_PORT,
        log_level="info",
        log_config=None,
    )
