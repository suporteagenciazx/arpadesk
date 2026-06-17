from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime

from app.models import PaymentType, PaymentStatus, SaleStatus, UserLevel


# Auth
class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


# Users
class UserBase(BaseModel):
    name: str
    role_function: Optional[str] = None
    email: Optional[str] = None
    telegram: Optional[str] = None
    whatsapp: Optional[str] = None
    level: UserLevel


class UserCreate(UserBase):
    password: Optional[str] = None
    project_ids: list[int] = Field(default_factory=list)
    project_commissions: dict[str, float] = Field(default_factory=dict)


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role_function: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    telegram: Optional[str] = None
    whatsapp: Optional[str] = None
    level: Optional[UserLevel] = None
    is_active: Optional[bool] = None
    project_ids: Optional[list[int]] = None
    project_commissions: Optional[dict[str, float]] = None


class ProjectBrief(BaseModel):
    id: int
    name: str
    commission_percent: float = 0

    model_config = {"from_attributes": True}


class UserOut(BaseModel):
    id: int
    name: str
    role_function: Optional[str]
    email: Optional[str]
    telegram: Optional[str]
    whatsapp: Optional[str]
    level: UserLevel
    notify_sales: bool = False
    is_active: bool
    projects: list[ProjectBrief] = []

    model_config = {"from_attributes": True}


class NotificationSettingsUpdate(BaseModel):
    notify_sales: bool
    telegram_user_id: Optional[str] = None


# Projects
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectSettingsPatch(BaseModel):
    telegram_notify_on_ok: Optional[bool] = None


class ProjectOut(BaseModel):
    id: int
    name: str
    slug: str
    description: Optional[str]
    settings: dict
    is_active: bool

    model_config = {"from_attributes": True}


class ProjectMemberIn(BaseModel):
    user_id: int
    commission_percent: float = 0


class ProjectMemberOut(BaseModel):
    id: int
    user_id: int
    user_name: str
    user_level: UserLevel
    commission_percent: float

    model_config = {"from_attributes": True}


class PaymentSettingsIn(BaseModel):
    payment_type: PaymentType
    pix_key: Optional[str] = None
    pix_qr: Optional[str] = None
    crypto_address: Optional[str] = None
    crypto_network: Optional[str] = None
    crypto_qr: Optional[str] = None
    default_fine_percent: float = 0
    default_fine_amount: float = 0
    default_fine_notes: Optional[str] = None


class PaymentSettingsOut(PaymentSettingsIn):
    id: int
    project_id: int

    model_config = {"from_attributes": True}


class PeriodFineIn(BaseModel):
    participant_id: int
    period_start: date
    period_end: date
    amount: float = Field(ge=0)
    notes: Optional[str] = None


class PeriodFineOut(BaseModel):
    id: int
    participant_id: int
    participant_name: str
    period_start: date
    period_end: date
    amount: float
    notes: Optional[str] = None

    model_config = {"from_attributes": True}


# Sales
class SaleCreate(BaseModel):
    participant_id: int
    cnpj: Optional[str] = None
    phone: Optional[str] = None
    sale_version: str
    doc_type: str
    doc_custom: Optional[str] = None
    amount: float
    sale_date: Optional[date] = None
    cp_attachment_url: Optional[str] = None


class SaleUpdate(BaseModel):
    participant_id: Optional[int] = None
    cnpj: Optional[str] = None
    phone: Optional[str] = None
    sale_version: Optional[str] = None
    doc_type: Optional[str] = None
    doc_custom: Optional[str] = None
    amount: Optional[float] = None
    status: Optional[SaleStatus] = None
    sale_date: Optional[date] = None
    cp_attachment_url: Optional[str] = None


class SaleDeleteRequest(BaseModel):
    admin_password: str


class SaleOut(BaseModel):
    id: int
    sale_code: str
    participant_id: int
    participant_name: str
    cnpj: Optional[str]
    phone: Optional[str]
    sale_version: str
    doc_type: str
    doc_custom: Optional[str]
    amount: float
    status: SaleStatus
    sale_date: date
    cp_attachment_url: Optional[str] = None
    has_cp_attachment: bool = False
    created_at: datetime


class SaleAttachmentUrlOut(BaseModel):
    url: str

    model_config = {"from_attributes": True}


# Expenses
class ExpenseCreate(BaseModel):
    expense_type: str
    amount: float
    notes: Optional[str] = None
    expense_date: Optional[date] = None


class ExpenseUpdate(BaseModel):
    expense_type: Optional[str] = None
    amount: Optional[float] = None
    notes: Optional[str] = None
    expense_date: Optional[date] = None


class ExpenseOut(BaseModel):
    id: int
    expense_type: str
    amount: float
    notes: Optional[str]
    expense_date: date
    created_at: datetime

    model_config = {"from_attributes": True}


# Payments
class PaymentCreate(BaseModel):
    participant_id: int
    base_amount: float
    adjustment_amount: float = 0
    apply_fine: bool = False
    fine_percent: Optional[float] = None
    fine_amount: Optional[float] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    notes: Optional[str] = None


class PaymentOut(BaseModel):
    id: int
    participant_id: int
    participant_name: str
    base_amount: float
    adjustment_amount: float
    fine_percent: float
    fine_amount: float
    final_amount: float
    apply_fine: bool
    status: PaymentStatus
    period_start: Optional[date]
    period_end: Optional[date]
    paid_at: Optional[datetime]
    notes: Optional[str]
    payment_destination: Optional[dict] = None

    model_config = {"from_attributes": True}


class FinanceSummary(BaseModel):
    total_sales: float
    total_commissions: float
    total_expenses: float
    balance: float
    commissions: list[dict]


class TelegramBotSettingsIn(BaseModel):
    bot_token: Optional[str] = None


class TelegramNotificationSettingsIn(BaseModel):
    chat_id: Optional[str] = None
    send_mode: Optional[str] = None
    template: Optional[str] = None
    enabled: Optional[bool] = None
    attach_cp: Optional[bool] = None


class TelegramSettingsIn(BaseModel):
    bot_token: Optional[str] = None
    chat_id: Optional[str] = None
    send_mode: str = "group"
    message_template: Optional[str] = None
    registration_template: Optional[str] = None
    confirmation_template: Optional[str] = None
    notify_on_registration: Optional[bool] = None
    registration_chat_id: Optional[str] = None
    registration_send_mode: Optional[str] = None
    confirmation_chat_id: Optional[str] = None
    confirmation_send_mode: Optional[str] = None


class TelegramSettingsOut(BaseModel):
    bot_token: Optional[str] = None
    chat_id: Optional[str] = None
    send_mode: str = "group"
    message_template: str = ""
    registration_chat_id: Optional[str] = None
    registration_send_mode: str = "group"
    registration_template: str = ""
    notify_on_registration: bool = False
    attach_cp_on_registration: bool = False
    confirmation_chat_id: Optional[str] = None
    confirmation_send_mode: str = "group"
    confirmation_template: str = ""
    notify_on_confirmation: bool = True
    attach_cp_on_confirmation: bool = False
    has_token: bool = False


class TelegramTestIn(BaseModel):
    bot_token: Optional[str] = None
    chat_id: Optional[str] = None
    message: Optional[str] = None
    template: Optional[str] = None


class TelegramTestOut(BaseModel):
    ok: bool
    message: str
    bot_username: Optional[str] = None
    message_id: Optional[int] = None


TokenResponse.model_rebuild()
