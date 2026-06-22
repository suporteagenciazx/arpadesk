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
        """CREATE TABLE IF NOT EXISTS user_privileges (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            code VARCHAR(50) NOT NULL,
            CONSTRAINT uq_user_privilege UNIQUE (user_id, code)
        )""",
        """CREATE TABLE IF NOT EXISTS cash_closings (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,
            closed_by_id INTEGER NOT NULL REFERENCES users(id),
            closed_at TIMESTAMPTZ DEFAULT NOW(),
            summary_snapshot JSONB DEFAULT '{}',
            status VARCHAR(30) NOT NULL DEFAULT 'pending_admin',
            confirmed_by_id INTEGER REFERENCES users(id),
            confirmed_at TIMESTAMPTZ,
            CONSTRAINT uq_cash_closing_period UNIQUE (project_id, period_start, period_end)
        )""",
        """INSERT INTO user_privileges (user_id, code)
           SELECT id, 'cash_closing' FROM users
           WHERE level IN ('financeiro', 'contador', 'agente')
           AND NOT EXISTS (
             SELECT 1 FROM user_privileges up WHERE up.user_id = users.id AND up.code = 'cash_closing'
           )""",
        """INSERT INTO user_privileges (user_id, code)
           SELECT id, 'sale_confirm' FROM users
           WHERE level = 'financeiro'
           AND NOT EXISTS (
             SELECT 1 FROM user_privileges up WHERE up.user_id = users.id AND up.code = 'sale_confirm'
           )""",
        "ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ",
        "ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS reopened_by_id INTEGER REFERENCES users(id)",
        "ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS reopen_scope VARCHAR(20)",
        "ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS report_public_id VARCHAR(5)",
        "ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS report_tabs_locked BOOLEAN DEFAULT FALSE",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_closing_report_public_id ON cash_closings (project_id, report_public_id) WHERE report_public_id IS NOT NULL",
        """CREATE TABLE IF NOT EXISTS telegram_bots (
            id SERIAL PRIMARY KEY,
            display_name VARCHAR(120) NOT NULL,
            username VARCHAR(100),
            bot_token VARCHAR(255) NOT NULL,
            avatar_url TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )""",
        "ALTER TABLE telegram_settings ADD COLUMN IF NOT EXISTS registration_bot_id INTEGER REFERENCES telegram_bots(id) ON DELETE SET NULL",
        "ALTER TABLE telegram_settings ADD COLUMN IF NOT EXISTS confirmation_bot_id INTEGER REFERENCES telegram_bots(id) ON DELETE SET NULL",
        """INSERT INTO telegram_bots (display_name, username, bot_token, is_active)
           SELECT 'Bot principal', NULL, bot_token, TRUE
           FROM telegram_settings
           WHERE id = 1 AND bot_token IS NOT NULL AND TRIM(bot_token) <> ''
           AND NOT EXISTS (SELECT 1 FROM telegram_bots LIMIT 1)""",
        """CREATE TABLE IF NOT EXISTS project_automations (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            automation_key VARCHAR(40) NOT NULL,
            name VARCHAR(120) NOT NULL,
            description TEXT,
            is_enabled BOOLEAN DEFAULT FALSE,
            config JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT uq_project_automation_key UNIQUE (project_id, automation_key)
        )""",
        "ALTER TYPE projectautomationtype ADD VALUE IF NOT EXISTS 'cash_closing'",
        "ALTER TYPE projectautomationtype ADD VALUE IF NOT EXISTS 'goal_reached'",
        "ALTER TYPE projectautomationtype ADD VALUE IF NOT EXISTS 'payment_paid'",
        "ALTER TYPE projectautomationtype ADD VALUE IF NOT EXISTS 'fine_added'",
        "ALTER TYPE projectautomationtype ADD VALUE IF NOT EXISTS 'expense_changed'",
        "ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS clients_received INTEGER",
        """CREATE TABLE IF NOT EXISTS marketing_dispatches (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,
            channel VARCHAR(20) NOT NULL DEFAULT 'sms',
            sent_at TIMESTAMPTZ,
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT uq_marketing_dispatch_period_channel UNIQUE (project_id, period_start, period_end, channel)
        )""",
        """CREATE TABLE IF NOT EXISTS marketing_lists (
            id SERIAL PRIMARY KEY,
            dispatch_id INTEGER NOT NULL REFERENCES marketing_dispatches(id) ON DELETE CASCADE,
            name VARCHAR(200) NOT NULL,
            exported_at DATE,
            sent_at DATE,
            investment_amount NUMERIC(12, 2) DEFAULT 0,
            message_count INTEGER DEFAULT 0,
            attachment_object_key VARCHAR(500),
            created_at TIMESTAMPTZ DEFAULT NOW()
        )""",
        """CREATE TABLE IF NOT EXISTS app_settings (
            key VARCHAR(64) PRIMARY KEY,
            value JSONB DEFAULT '{}',
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )""",
        """CREATE TABLE IF NOT EXISTS user_sectors (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            sector_id VARCHAR(50) NOT NULL,
            CONSTRAINT uq_user_sector UNIQUE (user_id, sector_id)
        )""",
        """INSERT INTO user_sectors (user_id, sector_id)
           SELECT id, 'financeiro' FROM users
           WHERE level != 'ilustrativo'
           AND NOT EXISTS (
             SELECT 1 FROM user_sectors us WHERE us.user_id = users.id
           )""",
        """INSERT INTO user_sectors (user_id, sector_id)
           SELECT id, 'marketing' FROM users
           WHERE level = 'admin'
           AND NOT EXISTS (
             SELECT 1 FROM user_sectors us
             WHERE us.user_id = users.id AND us.sector_id = 'marketing'
           )""",
        """INSERT INTO user_sectors (user_id, sector_id)
           SELECT id, 'suporte' FROM users
           WHERE level = 'admin'
           AND NOT EXISTS (
             SELECT 1 FROM user_sectors us
             WHERE us.user_id = users.id AND us.sector_id = 'suporte'
           )""",
        "ALTER TABLE project_members ADD COLUMN IF NOT EXISTS access_config JSONB DEFAULT '{}'",
        """CREATE TABLE IF NOT EXISTS project_clients (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            cnpj VARCHAR(18) NOT NULL,
            phone VARCHAR(22),
            estado VARCHAR(2),
            porte VARCHAR(80),
            opening_date DATE,
            email VARCHAR(255),
            registered_at DATE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT uq_project_client_cnpj UNIQUE (project_id, cnpj)
        )""",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            try:
                conn.execute(text(stmt))
            except Exception:
                pass
