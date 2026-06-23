from supabase import create_client, Client
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_role_key: str
    supabase_anon_key: str = ""  # needed for user-scoped RLS clients
    supabase_jwt_secret: str = ""  # not needed for service-role calls; optional for bench/scripts
    frontend_url: str = "http://localhost:3000"
    ingest_service_key: str = ""
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""
    payment_checkout_enabled: bool = False
    access_plan_codes: str = ""
    founder_plan_codes: str = ""
    admin_emails: str = ""
    telegram_bot_token: str = ""    # set via Railway: TELEGRAM_BOT_TOKEN
    telegram_webhook_secret: str = ""  # set as Telegram secret_token; validated on webhook updates
    feedback_storage_mode: str = "auto"  # auto, table, or waitlist
    enable_yfinance_refresh: bool = False  # optional fallback; official EOD ingest is primary
    broker_live_orders_enabled: bool = False  # Professional Access keeps broker read-only/import-only by default

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()

_admin_client: Client | None = None


def get_admin_client() -> Client:
    """Service-role client — bypasses RLS. Use only for ingest, admin tasks, and
    routes that already scope queries by the JWT-validated user_id."""
    global _admin_client
    if _admin_client is None:
        _admin_client = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )
    return _admin_client


def get_user_client(jwt: str) -> Client:
    """Per-request client scoped to the user's JWT — RLS enforced.
    Prefer this in new user-facing routes."""
    from supabase.lib.client_options import SyncClientOptions
    return create_client(
        settings.supabase_url,
        settings.supabase_anon_key,
        options=SyncClientOptions(headers={"Authorization": f"Bearer {jwt}"}),
    )
