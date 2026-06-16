from sqlalchemy import text

from app.database import engine


def run_migrations() -> None:
    statements = [
        "ALTER TABLE sales ADD COLUMN IF NOT EXISTS cp_attachment_url VARCHAR(500)",
        "ALTER TYPE userlevel ADD VALUE IF NOT EXISTS 'financeiro'",
        "ALTER TYPE userlevel ADD VALUE IF NOT EXISTS 'contador'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_sales BOOLEAN DEFAULT FALSE",
        "ALTER TABLE telegram_settings ADD COLUMN IF NOT EXISTS registration_template TEXT",
        "ALTER TABLE telegram_settings ADD COLUMN IF NOT EXISTS confirmation_template TEXT",
        "ALTER TABLE telegram_settings ADD COLUMN IF NOT EXISTS notify_on_registration BOOLEAN DEFAULT FALSE",
        """UPDATE telegram_settings
           SET confirmation_template = message_template
           WHERE confirmation_template IS NULL AND message_template IS NOT NULL""",
        "ALTER TABLE telegram_settings ADD COLUMN IF NOT EXISTS registration_chat_id VARCHAR(64)",
        "ALTER TABLE telegram_settings ADD COLUMN IF NOT EXISTS confirmation_chat_id VARCHAR(64)",
        """UPDATE telegram_settings
           SET registration_chat_id = chat_id
           WHERE registration_chat_id IS NULL AND chat_id IS NOT NULL""",
        """UPDATE telegram_settings
           SET confirmation_chat_id = chat_id
           WHERE confirmation_chat_id IS NULL AND chat_id IS NOT NULL""",
        "ALTER TABLE telegram_settings ADD COLUMN IF NOT EXISTS registration_send_mode telegramsendmode DEFAULT 'group'",
        "ALTER TABLE telegram_settings ADD COLUMN IF NOT EXISTS confirmation_send_mode telegramsendmode DEFAULT 'group'",
        "ALTER TABLE payments ADD COLUMN IF NOT EXISTS adjustment_amount NUMERIC(12, 2) DEFAULT 0",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            try:
                conn.execute(text(stmt))
            except Exception:
                pass
