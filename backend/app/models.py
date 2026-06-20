import enum
import random
import string
from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserLevel(str, enum.Enum):
    admin = "admin"
    financeiro = "financeiro"
    contador = "contador"
    agente = "agente"
    ilustrativo = "ilustrativo"


class SaleStatus(str, enum.Enum):
    pendente = "pendente"
    em_analise = "em_analise"
    bloqueado = "bloqueado"
    ok = "ok"
    pendente_selfie = "pendente_selfie"


class PaymentType(str, enum.Enum):
    pix = "pix"
    crypto = "crypto"


class PaymentStatus(str, enum.Enum):
    pendente = "pendente"
    pago = "pago"


class TelegramSendMode(str, enum.Enum):
    group = "group"
    channel = "channel"
    user = "user"


class CashClosingStatus(str, enum.Enum):
    pending_admin = "pending_admin"
    confirmed = "confirmed"


def utcnow():
    return datetime.now(timezone.utc)


def generate_sale_code() -> str:
    return "".join(random.choices(string.digits, k=6))


DEFAULT_DOC_TYPES = ["LAE", "DVEGO", "DECORE", "LAUDO", "OUTROS"]
DEFAULT_EXPENSE_TYPES = ["DIVULGACAO", "FINANCEIRO", "SUPORTE", "OUTROS"]


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    role_function: Mapped[str | None] = mapped_column(String(200), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    telegram: Mapped[str | None] = mapped_column(String(100), nullable=True)
    whatsapp: Mapped[str | None] = mapped_column(String(30), nullable=True)
    level: Mapped[UserLevel] = mapped_column(Enum(UserLevel), default=UserLevel.agente)
    notify_sales: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    project_memberships: Mapped[list["ProjectMember"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    privileges: Mapped[list["UserPrivilege"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )


class UserPrivilege(Base):
    __tablename__ = "user_privileges"
    __table_args__ = (UniqueConstraint("user_id", "code", name="uq_user_privilege"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    code: Mapped[str] = mapped_column(String(50))

    user: Mapped["User"] = relationship(back_populates="privileges")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    members: Mapped[list["ProjectMember"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    payment_settings: Mapped["ProjectPaymentSettings | None"] = relationship(
        back_populates="project", uselist=False, cascade="all, delete-orphan"
    )
    sales: Mapped[list["Sale"]] = relationship(back_populates="project")
    expenses: Mapped[list["Expense"]] = relationship(back_populates="project")
    payments: Mapped[list["Payment"]] = relationship(back_populates="project")
    period_fines: Mapped[list["PeriodFine"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    period_commissions: Mapped[list["PeriodCommission"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    report_imports: Mapped[list["ReportImport"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    report_import_logs: Mapped[list["ReportImportLog"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    cash_closings: Mapped[list["CashClosing"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class CashClosing(Base):
    __tablename__ = "cash_closings"
    __table_args__ = (
        UniqueConstraint("project_id", "period_start", "period_end", name="uq_cash_closing_period"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    closed_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    closed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    summary_snapshot: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[CashClosingStatus] = mapped_column(
        Enum(CashClosingStatus), default=CashClosingStatus.pending_admin
    )
    confirmed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reopened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reopened_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reopen_scope: Mapped[str | None] = mapped_column(String(20), nullable=True)
    report_public_id: Mapped[str | None] = mapped_column(String(5), nullable=True)
    report_tabs_locked: Mapped[bool] = mapped_column(Boolean, default=False)

    project: Mapped["Project"] = relationship(back_populates="cash_closings")
    closed_by: Mapped["User"] = relationship(foreign_keys=[closed_by_id])
    confirmed_by: Mapped["User | None"] = relationship(foreign_keys=[confirmed_by_id])
    reopened_by: Mapped["User | None"] = relationship(foreign_keys=[reopened_by_id])


class ProjectMember(Base):
    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id", name="uq_project_user"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    commission_percent: Mapped[float] = mapped_column(Numeric(5, 2), default=0)

    project: Mapped["Project"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="project_memberships")


class ProjectPaymentSettings(Base):
    __tablename__ = "project_payment_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), unique=True)
    payment_type: Mapped[PaymentType] = mapped_column(Enum(PaymentType), default=PaymentType.pix)
    pix_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pix_qr: Mapped[str | None] = mapped_column(Text, nullable=True)
    crypto_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    crypto_network: Mapped[str | None] = mapped_column(String(80), nullable=True)
    crypto_qr: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_fine_percent: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    default_fine_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    default_fine_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    project: Mapped["Project"] = relationship(back_populates="payment_settings")


class Sale(Base):
    __tablename__ = "sales"
    __table_args__ = (UniqueConstraint("project_id", "sale_code", name="uq_project_sale_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    participant_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    sale_code: Mapped[str] = mapped_column(String(6))
    cnpj: Mapped[str | None] = mapped_column(String(22), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(22), nullable=True)
    sale_version: Mapped[str] = mapped_column(String(10))
    doc_type: Mapped[str] = mapped_column(String(50))
    doc_custom: Mapped[str | None] = mapped_column(String(100), nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    status: Mapped[SaleStatus] = mapped_column(Enum(SaleStatus), default=SaleStatus.pendente)
    sale_date: Mapped[date] = mapped_column(Date, default=date.today)
    cp_attachment_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    project: Mapped["Project"] = relationship(back_populates="sales")
    participant: Mapped["User"] = relationship(foreign_keys=[participant_id])


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    expense_type: Mapped[str] = mapped_column(String(50))
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    expense_date: Mapped[date] = mapped_column(Date, default=date.today)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    project: Mapped["Project"] = relationship(back_populates="expenses")


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    participant_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    base_amount: Mapped[float] = mapped_column(Numeric(12, 2))
    fine_percent: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    fine_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    final_amount: Mapped[float] = mapped_column(Numeric(12, 2))
    apply_fine: Mapped[bool] = mapped_column(Boolean, default=False)
    adjustment_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    status: Mapped[PaymentStatus] = mapped_column(Enum(PaymentStatus), default=PaymentStatus.pendente)
    period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    period_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    project: Mapped["Project"] = relationship(back_populates="payments")
    participant: Mapped["User"] = relationship()


class PeriodFine(Base):
    __tablename__ = "period_fines"
    __table_args__ = (
        UniqueConstraint(
            "project_id", "participant_id", "period_start", "period_end", name="uq_period_fine"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    participant_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    project: Mapped["Project"] = relationship(back_populates="period_fines")
    participant: Mapped["User"] = relationship(foreign_keys=[participant_id])


class PeriodCommission(Base):
    """% e valores de comissão vigentes apenas no período (ex.: importação de PDF histórico)."""

    __tablename__ = "period_commissions"
    __table_args__ = (
        UniqueConstraint(
            "project_id", "participant_id", "period_start", "period_end", name="uq_period_commission"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    participant_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    commission_percent: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    sales_base: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    commission_amount: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    source: Mapped[str] = mapped_column(String(30), default="pdf_import")
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    project: Mapped["Project"] = relationship(back_populates="period_commissions")
    participant: Mapped["User"] = relationship(foreign_keys=[participant_id])


class ReportImport(Base):
    __tablename__ = "report_imports"
    __table_args__ = (
        UniqueConstraint("project_id", "period_start", "period_end", name="uq_report_import_period"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    pdf_object_key: Mapped[str] = mapped_column(String(500))
    original_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    extracted_data: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    project: Mapped["Project"] = relationship(back_populates="report_imports")


class ReportImportLog(Base):
    __tablename__ = "report_import_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    original_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    project: Mapped["Project"] = relationship(back_populates="report_import_logs")
    created_by: Mapped["User | None"] = relationship(foreign_keys=[created_by_id])


class TelegramSettings(Base):
    __tablename__ = "telegram_settings"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    bot_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    chat_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    send_mode: Mapped[TelegramSendMode] = mapped_column(Enum(TelegramSendMode), default=TelegramSendMode.group)
    message_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    registration_chat_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    registration_send_mode: Mapped[TelegramSendMode] = mapped_column(
        Enum(TelegramSendMode), default=TelegramSendMode.group
    )
    registration_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    notify_on_registration: Mapped[bool] = mapped_column(Boolean, default=False)
    attach_cp_on_registration: Mapped[bool] = mapped_column(Boolean, default=False)
    confirmation_chat_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    confirmation_send_mode: Mapped[TelegramSendMode] = mapped_column(
        Enum(TelegramSendMode), default=TelegramSendMode.group
    )
    confirmation_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    notify_on_confirmation: Mapped[bool] = mapped_column(Boolean, default=True)
    attach_cp_on_confirmation: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
