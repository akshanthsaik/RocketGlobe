from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    LL2_BASE_URL: str = "https://ll.thespacedevs.com/2.3.0"
    LL2_SYNC_INTERVAL: int = 900
    LL2_MIN_REQUEST_INTERVAL: float = 2.0
    LL2_BASE_BACKOFF: float = 1.0
    LL2_MAX_BACKOFF: float = 120.0
    LL2_MAX_RETRIES: int = 40
    LL2_MAX_WAIT_SECONDS: int = 600
    SQL_ECHO: bool = False
    API_HOST: str = "localhost"
    API_PORT: int = 8000
    
    class Config:
        env_file = ".env"

settings = Settings()
