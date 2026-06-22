"""Automações por projeto (notificações Telegram, etc.)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import Project, ProjectAutomation, ProjectAutomationType, TelegramSettings
from app.services.telegram_templates import (
    DEFAULT_CASH_CLOSING_TEMPLATE,
    DEFAULT_CONFIRMATION_TEMPLATE,
    DEFAULT_EXPENSE_CHANGED_TEMPLATE,
    DEFAULT_FINE_ADDED_TEMPLATE,
    DEFAULT_GOAL_REACHED_TEMPLATE,
    DEFAULT_PAYMENT_PAID_TEMPLATE,
    DEFAULT_REGISTRATION_TEMPLATE,
)

AUTOMATION_DEFAULTS: dict[ProjectAutomationType, dict] = {
    ProjectAutomationType.sale_registration: {
        "name": "Registro de vendas",
        "description": "Notifica ao cadastrar uma nova venda (status Pendente).",
        "template": DEFAULT_REGISTRATION_TEMPLATE,
    },
    ProjectAutomationType.sale_confirmation: {
        "name": "Confirmação de vendas",
        "description": "Notifica quando o financeiro confirma a venda (status OK).",
        "template": DEFAULT_CONFIRMATION_TEMPLATE,
    },
    ProjectAutomationType.cash_closing: {
        "name": "Fechamento de caixa",
        "description": "Quando um usuário não admin fecha o caixa, envia resumo com quem fechou, data e hora.",
        "template": DEFAULT_CASH_CLOSING_TEMPLATE,
    },
    ProjectAutomationType.goal_reached: {
        "name": "Meta atingida",
        "description": "Notifica quando uma regra de bônus ativa atinge a meta (mensagens customizadas nas configurações do projeto).",
        "template": DEFAULT_GOAL_REACHED_TEMPLATE,
    },
    ProjectAutomationType.payment_paid: {
        "name": "Pagamento realizado",
        "description": "Notifica quando um pagamento é marcado como pago.",
        "template": DEFAULT_PAYMENT_PAID_TEMPLATE,
    },
    ProjectAutomationType.fine_added: {
        "name": "Multa adicionada",
        "description": "Notifica quando uma multa é registrada no período.",
        "template": DEFAULT_FINE_ADDED_TEMPLATE,
    },
    ProjectAutomationType.expense_changed: {
        "name": "Despesa alterada",
        "description": "Notifica quando uma despesa é adicionada, editada ou excluída.",
        "template": DEFAULT_EXPENSE_CHANGED_TEMPLATE,
    },
}

ALL_AUTOMATION_TYPES = list(AUTOMATION_DEFAULTS.keys())


def _empty_config(template: str) -> dict:
    return {
        "chat_id": "",
        "send_mode": "group",
        "template": template,
        "attach_cp": False,
        "bot_id": None,
    }


def automation_to_dict(row: ProjectAutomation) -> dict:
    return {
        "id": row.id,
        "project_id": row.project_id,
        "automation_key": row.automation_key.value,
        "name": row.name,
        "description": row.description or "",
        "is_enabled": bool(row.is_enabled),
        "config": row.config or {},
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _registration_config_from_telegram(telegram: TelegramSettings) -> dict:
    return {
        "chat_id": telegram.registration_chat_id or telegram.chat_id or "",
        "send_mode": (
            telegram.registration_send_mode.value if telegram.registration_send_mode else "group"
        ),
        "template": telegram.registration_template or DEFAULT_REGISTRATION_TEMPLATE,
        "attach_cp": bool(telegram.attach_cp_on_registration),
        "bot_id": telegram.registration_bot_id,
    }


def _confirmation_config_from_telegram(telegram: TelegramSettings) -> dict:
    return {
        "chat_id": telegram.confirmation_chat_id or telegram.chat_id or "",
        "send_mode": (
            telegram.confirmation_send_mode.value if telegram.confirmation_send_mode else "group"
        ),
        "template": (
            telegram.confirmation_template
            or telegram.message_template
            or DEFAULT_CONFIRMATION_TEMPLATE
        ),
        "attach_cp": bool(telegram.attach_cp_on_confirmation),
        "bot_id": telegram.confirmation_bot_id,
    }


def _should_migrate_legacy(project: Project) -> bool:
    return (project.name or "").strip().upper() == "AGENCIA"


def _create_automation_row(
    project_id: int,
    key: ProjectAutomationType,
    *,
    is_enabled: bool = False,
    config: dict | None = None,
) -> ProjectAutomation:
    meta = AUTOMATION_DEFAULTS[key]
    return ProjectAutomation(
        project_id=project_id,
        automation_key=key,
        name=meta["name"],
        description=meta["description"],
        is_enabled=is_enabled,
        config=config or _empty_config(meta["template"]),
    )


def sync_project_automations(db: Session, project_id: int) -> list[ProjectAutomation]:
    project = db.get(Project, project_id)
    if not project:
        return []

    existing = (
        db.query(ProjectAutomation)
        .filter(ProjectAutomation.project_id == project_id)
        .order_by(ProjectAutomation.id.asc())
        .all()
    )
    existing_keys = {row.automation_key for row in existing}

    if not existing:
        telegram = db.get(TelegramSettings, 1)
        migrate = _should_migrate_legacy(project) and telegram is not None

        reg_config = _empty_config(DEFAULT_REGISTRATION_TEMPLATE)
        conf_config = _empty_config(DEFAULT_CONFIRMATION_TEMPLATE)
        reg_enabled = False
        conf_enabled = False

        if migrate:
            reg_config = _registration_config_from_telegram(telegram)
            conf_config = _confirmation_config_from_telegram(telegram)
            reg_enabled = bool(telegram.notify_on_registration)
            conf_enabled = bool(telegram.notify_on_confirmation)

        rows = [
            _create_automation_row(
                project_id,
                ProjectAutomationType.sale_registration,
                is_enabled=reg_enabled,
                config=reg_config,
            ),
            _create_automation_row(
                project_id,
                ProjectAutomationType.sale_confirmation,
                is_enabled=conf_enabled,
                config=conf_config,
            ),
        ]
        for key in ALL_AUTOMATION_TYPES:
            if key in (ProjectAutomationType.sale_registration, ProjectAutomationType.sale_confirmation):
                continue
            rows.append(_create_automation_row(project_id, key))
        db.add_all(rows)
        db.commit()
        for row in rows:
            db.refresh(row)
        return rows

    missing = [key for key in ALL_AUTOMATION_TYPES if key not in existing_keys]
    if missing:
        new_rows = [_create_automation_row(project_id, key) for key in missing]
        db.add_all(new_rows)
        db.commit()
        for row in new_rows:
            db.refresh(row)
        existing = (
            db.query(ProjectAutomation)
            .filter(ProjectAutomation.project_id == project_id)
            .order_by(ProjectAutomation.id.asc())
            .all()
        )
    return existing


def ensure_project_automations(db: Session, project_id: int) -> list[ProjectAutomation]:
    return sync_project_automations(db, project_id)


def list_project_automations(db: Session, project_id: int) -> list[dict]:
    rows = sync_project_automations(db, project_id)
    return [automation_to_dict(r) for r in rows]


def get_project_automation(db: Session, project_id: int, automation_id: int) -> ProjectAutomation | None:
    return (
        db.query(ProjectAutomation)
        .filter(ProjectAutomation.project_id == project_id, ProjectAutomation.id == automation_id)
        .first()
    )


def get_automation_by_key(
    db: Session, project_id: int, key: ProjectAutomationType
) -> ProjectAutomation | None:
    sync_project_automations(db, project_id)
    return (
        db.query(ProjectAutomation)
        .filter(
            ProjectAutomation.project_id == project_id,
            ProjectAutomation.automation_key == key,
        )
        .first()
    )
