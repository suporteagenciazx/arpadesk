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


class ProjectSectorAccessIn(BaseModel):
    sector_id: str
    enabled: bool = False
    privileges: list[str] = Field(default_factory=list)


class ProjectAssignmentIn(BaseModel):
    project_id: int
    commission_percent: float = 0
    sectors: list[ProjectSectorAccessIn] = Field(default_factory=list)


class ProjectAssignmentOut(BaseModel):
    id: int
    name: str
    commission_percent: float = 0
    sectors: list[ProjectSectorAccessIn] = Field(default_factory=list)


class UserCreate(UserBase):
    password: Optional[str] = None
    project_ids: list[int] = Field(default_factory=list)
    project_commissions: dict[str, float] = Field(default_factory=dict)
    project_assignments: list[ProjectAssignmentIn] = Field(default_factory=list)
    privileges: list[str] = Field(default_factory=list)
    sector_ids: list[str] = Field(default_factory=list)


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
    project_assignments: Optional[list[ProjectAssignmentIn]] = None
    privileges: Optional[list[str]] = None
    sector_ids: Optional[list[str]] = None


class ProjectBrief(BaseModel):
    id: int
    name: str
    commission_percent: float = 0
    sectors: list[ProjectSectorAccessIn] = Field(default_factory=list)

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
    privileges: list[str] = []
    sector_ids: list[str] = []

    model_config = {"from_attributes": True}


class PrivilegeOut(BaseModel):
    code: str
    label: str
    description: str


class CashClosingPreviewOut(BaseModel):
    period_start: str
    period_end: str
    billing_total: float
    sales_count: int
    ok_sales_count: int
    ok_total: float
    fines_total: float
    total_commissions: float = 0
    sales: list[dict] = Field(default_factory=list)
    fines: list[dict] = Field(default_factory=list)
    commissions: list[dict] = Field(default_factory=list)


class CashClosingOut(BaseModel):
    id: int
    project_id: int
    period_start: str
    period_end: str
    closed_by_id: int
    closed_by_name: str
    closed_at: Optional[str] = None
    status: str
    confirmed_by_id: Optional[int] = None
    confirmed_by_name: Optional[str] = None
    confirmed_at: Optional[str] = None
    summary_snapshot: dict = Field(default_factory=dict)
    frozen_for_user: bool = False
    reopened_at: Optional[str] = None
    reopened_by_id: Optional[int] = None
    reopened_by_name: Optional[str] = None
    reopen_scope: Optional[str] = None
    report_public_id: Optional[str] = None
    report_tabs_locked: bool = False
    clients_received: Optional[int] = None


class CashClosingSubmitIn(BaseModel):
    clients_received: Optional[int] = None


class ReportSaveCommitIn(BaseModel):
    clients_received: Optional[int] = None


class ReportSavePreviewOut(BaseModel):
    period_start: str
    period_end: str
    billing_total: float
    expenses_total: float
    commissions_paid_ex_admin: float
    profit: float
    sales_count: int
    ok_sales_count: int
    roi_percent: Optional[float] = None
    sales: list[dict] = Field(default_factory=list)
    expenses: list[dict] = Field(default_factory=list)
    commissions: list[dict] = Field(default_factory=list)
    payments: list[dict] = Field(default_factory=list)
    next_active_period_start: Optional[str] = None
    next_active_period_end: Optional[str] = None


class ActivePeriodOut(BaseModel):
    period_start: str
    period_end: str
    week_open_for_team: bool = True
    next_opening_date: Optional[str] = None


class CashClosingReopenIn(BaseModel):
    admin_password: str
    scope: str = "all"  # all | admin_only


class CashClosingResaveOut(BaseModel):
    closing: CashClosingOut
    changes: dict = Field(default_factory=dict)


class NotificationSettingsUpdate(BaseModel):
    notify_sales: bool
    telegram_user_id: Optional[str] = None


# Projects
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    sectors: list[str] = Field(default_factory=list)
    origin_sector: str = "financeiro"


class ProjectSectorToggle(BaseModel):
    sector_id: str
    enabled: bool


class ProjectSectorsPatch(BaseModel):
    sectors: list[ProjectSectorToggle]


class SectorDefinitionIn(BaseModel):
    id: Optional[str] = None
    label: str
    color: str = "#64748b"
    always_on: bool = False
    admin_only: bool = False
    sidebar_visible: bool = True
    sidebar_order: int = 0
    route: Optional[str] = None


class SectorRegistryOut(BaseModel):
    sectors: list[dict]


class SectorRegistryUpdate(BaseModel):
    sectors: list[SectorDefinitionIn]


class GestaoProjectOut(BaseModel):
    id: int
    name: str
    slug: str
    description: Optional[str] = None
    sectors: list[dict] = Field(default_factory=list)


class GestaoDashboardTotals(BaseModel):
    billing_total: float = 0
    expenses_total: float = 0
    investment_total: float = 0
    profit_total: float = 0
    commissions_paid_total: float = 0
    roas_ratio: Optional[float] = None
    roi_percent: Optional[float] = None
    cash_closings_count: int = 0


class GestaoDashboardProjectRow(BaseModel):
    project_id: int
    project_name: str
    billing_total: float = 0
    expenses_total: float = 0
    investment_total: float = 0
    profit_total: float = 0
    commissions_paid_total: float = 0
    roas_ratio: Optional[float] = None
    roi_percent: Optional[float] = None
    cash_closings_count: int = 0


class GestaoDashboardOut(BaseModel):
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    project_count: int = 0
    totals: GestaoDashboardTotals
    by_project: list[GestaoDashboardProjectRow] = Field(default_factory=list)


class ProjectUpdate(BaseModel):
    name: str


class ProjectDeleteRequest(BaseModel):
    admin_password: str


class ProjectSettingsPatch(BaseModel):
    telegram_notify_on_ok: Optional[bool] = None


class WeeklyClosingConfigIn(BaseModel):
    default_weekday: Optional[int] = None
    default_time: Optional[str] = None
    mode: Optional[str] = None
    current_week: Optional[dict] = None


class DailyClosingConfigIn(BaseModel):
    enabled: Optional[bool] = None
    time: Optional[str] = None
    mode: Optional[str] = None


class ClosingScheduleIn(BaseModel):
    weekly: Optional[WeeklyClosingConfigIn] = None
    daily: Optional[DailyClosingConfigIn] = None


class BonusRuleIn(BaseModel):
    id: Optional[str] = None
    name: str = "Regra de bônus"
    enabled: bool = True
    rule_type: str = "user_threshold"
    period: str = "week"
    threshold_amount: float = 0
    reward_type: str = "fixed"
    reward_value: float = 0
    participant_ids: list[int] = Field(default_factory=list)
    description: str = ""
    expires_at: Optional[str] = None
    notify_on_automation: bool = False
    notify_message: str = ""


class ProjectFinanceConfigPatch(BaseModel):
    closing_schedule: Optional[ClosingScheduleIn] = None
    bonus_rules: Optional[list[BonusRuleIn]] = None


class ProjectOut(BaseModel):
    id: int
    name: str
    slug: str
    description: Optional[str]
    settings: dict
    is_active: bool

    model_config = {"from_attributes": True}


class ProjectPermissionPatch(BaseModel):
    sectors: list[ProjectSectorAccessIn] = Field(default_factory=list)


class ProjectPermissionMemberOut(BaseModel):
    user_id: int
    user_name: str
    user_level: UserLevel
    user_email: Optional[str] = None
    commission_percent: float = 0
    sectors: list[ProjectSectorAccessIn] = Field(default_factory=list)


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


class ProjectFinanceConfigOut(BaseModel):
    closing_schedule: dict
    bonus_rules: list[dict]
    members: list[ProjectMemberOut] = Field(default_factory=list)


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


class ReportImportOut(BaseModel):
    id: int
    project_id: int
    period_start: date
    period_end: date
    original_filename: Optional[str] = None
    extracted_data: dict = Field(default_factory=dict)
    created_at: datetime

    model_config = {"from_attributes": True}


class ReportImportLogOut(BaseModel):
    id: int
    period_start: date
    period_end: date
    original_filename: Optional[str] = None
    saved_at: datetime
    created_by_name: Optional[str] = None

    model_config = {"from_attributes": True}


class ReportArchiveRowOut(BaseModel):
    id: str
    period_start: str
    period_end: str
    description: str
    billing_total: float
    expenses_total: float
    sales_count: int
    profit: float
    saved_at: Optional[str] = None
    has_pdf: bool = False
    is_active_period: bool = False


class ReportArchiveReopenIn(BaseModel):
    admin_password: str


class ReportImportParseOut(BaseModel):
    staging_id: str
    period_start: date
    period_end: date
    original_filename: Optional[str] = None
    parse_status: str
    extracted_data: dict = Field(default_factory=dict)
    preview: dict = Field(default_factory=dict)


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


class SaleAdminUpdate(BaseModel):
    admin_password: str
    participant_id: Optional[int] = None
    cnpj: Optional[str] = None
    phone: Optional[str] = None
    sale_version: Optional[str] = None
    doc_type: Optional[str] = None
    doc_custom: Optional[str] = None
    amount: Optional[float] = None
    sale_date: Optional[date] = None


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


class TelegramBotCreateIn(BaseModel):
    display_name: str
    username: Optional[str] = None
    bot_token: str


class TelegramBotUpdateIn(BaseModel):
    display_name: Optional[str] = None
    username: Optional[str] = None
    bot_token: Optional[str] = None
    is_active: Optional[bool] = None


class TelegramBotOut(BaseModel):
    id: int
    display_name: str
    username: Optional[str] = None
    is_active: bool = True
    avatar_url: Optional[str] = None
    has_token: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class TelegramBotSettingsIn(BaseModel):
    bot_token: Optional[str] = None


class TelegramNotificationSettingsIn(BaseModel):
    chat_id: Optional[str] = None
    send_mode: Optional[str] = None
    template: Optional[str] = None
    enabled: Optional[bool] = None
    attach_cp: Optional[bool] = None
    bot_id: Optional[int] = None


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
    registration_bot_id: Optional[int] = None
    confirmation_bot_id: Optional[int] = None
    bots: list[TelegramBotOut] = Field(default_factory=list)


class TelegramTestIn(BaseModel):
    bot_token: Optional[str] = None
    bot_id: Optional[int] = None
    chat_id: Optional[str] = None
    message: Optional[str] = None
    template: Optional[str] = None


class TelegramTestOut(BaseModel):
    ok: bool
    message: str
    bot_username: Optional[str] = None
    message_id: Optional[int] = None


class ProjectAutomationConfigIn(BaseModel):
    chat_id: Optional[str] = None
    send_mode: Optional[str] = None
    template: Optional[str] = None
    attach_cp: Optional[bool] = None
    bot_id: Optional[int] = None


class ProjectAutomationUpdateIn(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_enabled: Optional[bool] = None
    config: Optional[ProjectAutomationConfigIn] = None


class ProjectAutomationOut(BaseModel):
    id: int
    project_id: int
    automation_key: str
    name: str
    description: str = ""
    is_enabled: bool = False
    config: dict = Field(default_factory=dict)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ProjectAutomationTestIn(BaseModel):
    bot_id: Optional[int] = None
    chat_id: Optional[str] = None
    message: Optional[str] = None
    template: Optional[str] = None


class ProjectMarketingConfigOut(BaseModel):
    enabled: bool = False
    channels: list[str] = Field(default_factory=lambda: ["sms", "whatsapp"])
    expense_types_marketing: list[str] = Field(default_factory=lambda: ["DIVULGACAO"])


class ProjectMarketingConfigPatch(BaseModel):
    enabled: Optional[bool] = None
    channels: Optional[list[str]] = None
    expense_types_marketing: Optional[list[str]] = None


class MarketingWeekRowOut(BaseModel):
    period_start: str
    period_end: str
    description: str
    month_label: str
    clients_received: Optional[int] = None
    clients_received_editable: bool = True
    sms_sent_total: int = 0
    whatsapp_sent_total: int = 0
    messages_sent_total: int = 0
    dispatch_count: int = 0
    list_count: int = 0
    investment_amount: float = 0
    investment_mode: str = "marketing"
    marketing_expenses_total: float = 0
    all_expenses_total: float = 0
    billing_total: float = 0
    profit: float = 0
    report_saved: bool = False
    cash_closing_id: Optional[int] = None


class MarketingClientsReceivedPatch(BaseModel):
    period_start: str
    period_end: str
    clients_received: Optional[int] = None


class MarketingListOut(BaseModel):
    id: int
    dispatch_id: int
    channel: str
    name: str
    exported_at: Optional[str] = None
    sent_at: Optional[str] = None
    investment_amount: float = 0
    message_count: int = 0
    has_attachment: bool = False


class MarketingListCreate(BaseModel):
    period_start: str
    period_end: str
    channel: str = "sms"
    name: str
    exported_at: Optional[str] = None
    sent_at: Optional[str] = None
    investment_amount: float = 0
    message_count: int = 0


class MarketingListUpdate(BaseModel):
    name: Optional[str] = None
    exported_at: Optional[str] = None
    sent_at: Optional[str] = None
    investment_amount: Optional[float] = None
    message_count: Optional[int] = None


class MarketingReportComparison(BaseModel):
    billing_pct: Optional[float] = None
    investment_pct: Optional[float] = None
    profit_pct: Optional[float] = None
    clients_pct: Optional[float] = None


class ProjectClientOut(BaseModel):
    id: int
    cnpj: str
    cnpj_display: str
    phone: Optional[str] = None
    estado: Optional[str] = None
    porte: Optional[str] = None
    opening_date: Optional[str] = None
    email: Optional[str] = None
    registered_at: Optional[str] = None
    sales_count: int = 0
    total_paid: float = 0


class ProjectClientUpdate(BaseModel):
    phone: Optional[str] = None
    estado: Optional[str] = None
    porte: Optional[str] = None
    opening_date: Optional[str] = None
    email: Optional[str] = None


class ProjectClientDeleteRequest(BaseModel):
    admin_password: str


class ProjectClientSaleOut(BaseModel):
    id: int
    sale_code: str
    amount: float
    sale_date: Optional[str] = None
    phone: Optional[str] = None
    status: str


class MarketingReportOut(BaseModel):
    period_start: str
    period_end: str
    description: str
    billing_total: float = 0
    investment_total: float = 0
    investment_mode: str = "marketing"
    marketing_expenses_total: float = 0
    all_expenses_total: float = 0
    profit: float = 0
    clients_received: Optional[int] = None
    sms_sent_total: int = 0
    whatsapp_sent_total: int = 0
    messages_sent_total: int = 0
    list_count: int = 0
    list_investment_total: float = 0
    roi_percent: Optional[float] = None
    roas_ratio: Optional[float] = None
    cost_per_client: Optional[float] = None
    report_saved: bool = False
    comparison: Optional[MarketingReportComparison] = None
    lists: list[MarketingListOut] = Field(default_factory=list)


TokenResponse.model_rebuild()
