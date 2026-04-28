from supabase import create_client, Client
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_role_key: str
    supabase_jwt_secret: str = ""  # not needed for service-role calls; optional for bench/scripts
    frontend_url: str = "http://localhost:3000"
    ingest_service_key: str = ""
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""
    founder_plan_codes: str = "FOUNDER100"
    admin_emails: str = ""
    anthropic_api_key: str = ""
    telegram_bot_token: str = ""    # set via Railway: TELEGRAM_BOT_TOKEN

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()

_admin_client: Client | None = None


def get_admin_client() -> Client:
    global _admin_client
    if _admin_client is None:
        _admin_client = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )
    return _admin_client
