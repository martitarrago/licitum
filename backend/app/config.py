from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")

    database_url: str
    app_env: str = "dev"
    debug: bool = True

    r2_account_id: str | None = None
    r2_access_key_id: str | None = None
    r2_secret_access_key: str | None = None
    r2_bucket: str | None = None
    r2_public_url_base: str | None = None

    # Railway inyecta REDIS_URL; CELERY_BROKER_URL tiene prioridad si está definido.
    redis_url: str | None = None
    celery_broker_url: str | None = None
    celery_result_backend: str | None = None

    anthropic_api_key: str | None = None

    # Supabase Auth — SUPABASE_JWT_SECRET viene de Settings → API → "JWT Secret"
    # en supabase.com. Si está vacío, la dependencia auth cae a verificación
    # remota vía /auth/v1/user (más lento, menos seguro).
    supabase_url: str | None = None
    supabase_anon_key: str | None = None
    supabase_service_key: str | None = None
    supabase_jwt_secret: str | None = None

    allowed_origins: str = "http://localhost:3000"
    # Regex para dominios de preview (ej: "https://licitum-.*\\.vercel\\.app")
    cors_origin_regex: str | None = None

    @property
    def broker_url(self) -> str:
        return self.celery_broker_url or self.redis_url or "redis://localhost:6379/0"

    @property
    def result_backend(self) -> str:
        return self.celery_result_backend or self.redis_url or "redis://localhost:6379/1"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
