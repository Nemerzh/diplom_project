from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "energy-backend"
    app_env: str = "dev"
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    database_url: str = "postgresql+psycopg2://energy:energy@postgres:5432/energy"
    # Фронт у Docker (nginx :8081), Vite dev (:5173), ім’я сервісу compose
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:8081,http://127.0.0.1:8081,"
        "http://localhost,http://frontend:5173,http://frontend"
    )
    alert_default_threshold_kwh: float = 500.0

    def cors_origins_list(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]


settings = Settings()
