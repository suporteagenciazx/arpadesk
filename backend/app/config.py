from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    cors_origins: str = "http://localhost:5173"
    database_url: str = "postgresql+psycopg2://arpadesk:devpass@postgres:5432/arpadesk_dev"
    jwt_secret_key: str = "dev-only-change-in-production"
    jwt_expires_minutes: int = 480
    seeded_admin_email: str = "admin@arpadesk.local"
    seeded_admin_password: str = "Admin@123"
    seeded_admin_name: str = "Administrador"

    s3_endpoint: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = "arpadesk"
    s3_region: str = "us-east-1"
    s3_use_ssl: bool = False
    s3_presign_expires: int = 3600
    s3_public_endpoint: str = ""

    redis_url: str = ""
    redis_cache_ttl: int = 120

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
