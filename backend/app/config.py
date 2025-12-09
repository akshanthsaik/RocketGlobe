from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    LL2_BASE_URL: str = "https://ll.thespacedevs.com/2.2.0"
    LL2_SYNC_INTERVAL: int = 900
    API_HOST: str = "localhost"
    API_PORT: int = 8000
    
    class Config:
        env_file = ".env"

settings = Settings()
