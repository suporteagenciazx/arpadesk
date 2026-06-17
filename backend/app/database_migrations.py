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
        "ALTER TABLE telegram_settings ADD COLUMN IF NOT EXISTS attach_cp_on_registration BOOLEAN DEFAULT FALSE",
        "ALTER TABLE telegram_settings ADD COLUMN IF NOT EXISTS attach_cp_on_confirmation BOOLEAN DEFAULT FALSE",
        "ALTER TABLE telegram_settings ADD COLUMN IF NOT EXISTS notify_on_confirmation BOOLEAN DEFAULT TRUE",
        "ALTER TABLE project_payment_settings ADD COLUMN IF NOT EXISTS default_fine_amount NUMERIC(12, 2) DEFAULT 0",
        "ALTER TABLE project_payment_settings ADD COLUMN IF NOT EXISTS default_fine_notes TEXT",
        """CREATE TABLE IF NOT EXISTS period_fines (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            participant_id INTEGER NOT NULL REFERENCES users(id),
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,
            amount NUMERIC(12, 2) NOT NULL,
            notes TEXT,
            created_by_id INTEGER REFERENCES users(id),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT uq_period_fine UNIQUE (project_id, participant_id, period_start, period_end)
        )""",
        """CREATE TABLE IF NOT EXISTS report_imports (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,
            pdf_object_key VARCHAR(500) NOT NULL,
            original_filename VARCHAR(255),
            extracted_data JSONB DEFAULT '{}',
            created_by_id INTEGER REFERENCES users(id),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT uq_report_import_period UNIQUE (project_id, period_start, period_end)
        )""",
        """CREATE TABLE IF NOT EXISTS period_commissions (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            participant_id INTEGER NOT NULL REFERENCES users(id),
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,
            commission_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
            sales_base NUMERIC(12, 2),
            commission_amount NUMERIC(12, 2),
            source VARCHAR(30) NOT NULL DEFAULT 'pdf_import',
            created_by_id INTEGER REFERENCES users(id),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT uq_period_commission UNIQUE (project_id, participant_id, period_start, period_end)
        )""",
        """CREATE TABLE IF NOT EXISTS report_import_logs (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,
            original_filename VARCHAR(255),
            created_by_id INTEGER REFERENCES users(id),
            saved_at TIMESTAMPTZ DEFAULT NOW()
        )""",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            try:
                conn.execute(text(stmt))
            except Exception:
                pass
