from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    LL2_BASE_URL: str = "https://ll.thespacedevs.com/2.3.0"
    LL2_SYNC_INTERVAL: int = 900
    LL2_SYNC_PAGE_LIMIT: int = 500
    LL2_MIN_REQUEST_INTERVAL: float = 2.0
    LL2_BASE_BACKOFF: float = 1.0
    LL2_MAX_BACKOFF: float = 60.0
    LL2_MAX_RETRIES: int = 8
    LL2_MAX_WAIT_SECONDS: int = 120
    LL2_MAX_REQUEST_DURATION: int = 300
    LL2_LAUNCHES_MIN_REQUEST_INTERVAL: float = 2.5
    LL2_LAUNCHES_MAX_RETRIES: int = 20
    LL2_LAUNCHES_MAX_WAIT_SECONDS: int = 300
    LL2_LAUNCHES_MAX_REQUEST_DURATION: int = 1800
    LL2_STATIC_RESOURCES_MIN_INTERVAL: int = 86400
    LL2_EXISTING_DATA_LOOKBACK_HOURS: int = 24
    LL2_ALLOW_PARTIAL_SYNC_ON_RATE_LIMIT: bool = True
    SQL_ECHO: bool = False
    API_HOST: str = "localhost"
    API_PORT: int = 8000
    
    class Config:
        env_file = ".env"

settings = Settings()
