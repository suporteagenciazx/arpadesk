from sqlalchemy.orm import Session

from app.models import User, UserLevel
from app.privileges_catalog import PRIVILEGE_CREATE_PROJECT, PRIVILEGE_PAYMENT_CONFIRM, PRIVILEGE_SALE_CONFIRM

SALE_STATUS_LEVELS = {UserLevel.admin, UserLevel.financeiro}
SALE_REGISTER_LEVELS = {
    UserLevel.admin,
    UserLevel.financeiro,
    UserLevel.contador,
    UserLevel.agente,
}
PAYMENT_LEVELS = {UserLevel.admin}
FINE_SETTINGS_LEVELS = {
    UserLevel.admin,
    UserLevel.financeiro,
    UserLevel.contador,
    UserLevel.agente,
}
ADMIN_ONLY_LEVELS = {UserLevel.admin}


def can_change_sale_status(db: Session, user: User, project_id: int | None = None) -> bool:
    if user.level == UserLevel.admin:
        return True
    from app.services.cash_closing import user_has_privilege

    return user_has_privilege(db, user, PRIVILEGE_SALE_CONFIRM, project_id=project_id)


def can_register_sale(user: User) -> bool:
    return user.level in SALE_REGISTER_LEVELS


def can_access_payments(db: Session, user: User, project_id: int | None = None) -> bool:
    if user.level == UserLevel.admin:
        return True
    if project_id is None:
        return False
    from app.services.cash_closing import user_has_privilege

    return user_has_privilege(db, user, PRIVILEGE_PAYMENT_CONFIRM, project_id=project_id)


def can_confirm_payment(db: Session, user: User, project_id: int) -> bool:
    return can_access_payments(db, user, project_id)


def can_manage_default_fine(user: User) -> bool:
    return user.level in FINE_SETTINGS_LEVELS


def can_access_admin_finance_tabs(user: User) -> bool:
    return user.level in ADMIN_ONLY_LEVELS


def can_create_project(db: Session, user: User) -> bool:
    from app.services.cash_closing import user_has_privilege

    return user_has_privilege(db, user, PRIVILEGE_CREATE_PROJECT)


def can_access_vendas(user: User) -> bool:
    return user.level in SALE_REGISTER_LEVELS
