from app.models import User, UserLevel

SALE_STATUS_LEVELS = {UserLevel.admin, UserLevel.financeiro}
SALE_REGISTER_LEVELS = {
    UserLevel.admin,
    UserLevel.financeiro,
    UserLevel.contador,
    UserLevel.agente,
}
PAYMENT_LEVELS = {UserLevel.admin, UserLevel.financeiro}
ADMIN_ONLY_LEVELS = {UserLevel.admin}


def can_change_sale_status(user: User) -> bool:
    return user.level in SALE_STATUS_LEVELS


def can_register_sale(user: User) -> bool:
    return user.level in SALE_REGISTER_LEVELS


def can_access_payments(user: User) -> bool:
    return user.level in PAYMENT_LEVELS


def can_access_admin_finance_tabs(user: User) -> bool:
    return user.level in ADMIN_ONLY_LEVELS


def can_access_vendas(user: User) -> bool:
    return user.level in SALE_REGISTER_LEVELS
