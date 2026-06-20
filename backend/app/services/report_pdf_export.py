"""Gera PDF do resumo de relatório semanal salvo."""

from __future__ import annotations

from datetime import date
from io import BytesIO

from fpdf import FPDF
from sqlalchemy.orm import Session

from app.models import Project
from app.services.calendar import format_br_date, report_week_description
from app.services.report_save import build_report_save_preview


def _br_money(value: float) -> str:
    s = f"{abs(value):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    prefix = "-" if value < 0 else ""
    return f"{prefix}R$ {s}"


def _txt(value: str | None) -> str:
    if not value:
        return "-"
    return str(value).encode("latin-1", "replace").decode("latin-1")


class ReportPdf(FPDF):
    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"Pagina {self.page_no()}/{{nb}}", align="C")


def generate_report_pdf(
    db: Session, project_id: int, period_start: date, period_end: date
) -> bytes:
    project = db.get(Project, project_id)
    preview = build_report_save_preview(db, project_id, period_start, period_end)
    description = report_week_description(period_start, period_end)
    project_name = project.name if project else "Projeto"

    pdf = ReportPdf()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, _txt(project_name), ln=True)
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 8, _txt(description), ln=True)
    pdf.cell(
        0,
        6,
        _txt(f"Periodo: {format_br_date(period_start)} a {format_br_date(period_end)}"),
        ln=True,
    )
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Resumo", ln=True)
    pdf.set_font("Helvetica", "", 10)
    summary_lines = [
        ("Faturamento", _br_money(preview["billing_total"])),
        ("Despesas", _br_money(-abs(preview["expenses_total"]))),
        ("Comissoes (sem admin)", _br_money(preview["commissions_paid_ex_admin"])),
        ("Lucro", _br_money(preview["profit"])),
        ("Quantidade de vendas", str(preview["sales_count"])),
        ("Vendas OK", str(preview["ok_sales_count"])),
    ]
    if preview.get("roi_percent") is not None:
        summary_lines.append(("ROI", f"{preview['roi_percent']}%"))
    for label, value in summary_lines:
        pdf.cell(70, 7, _txt(label))
        pdf.cell(0, 7, _txt(value), ln=True)
    pdf.ln(4)

    def table_section(title: str, headers: list[str], rows: list[list[str]], widths: list[int]):
        if not rows:
            return
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 8, _txt(title), ln=True)
        pdf.set_font("Helvetica", "B", 9)
        for i, h in enumerate(headers):
            pdf.cell(widths[i], 7, _txt(h), border=1)
        pdf.ln()
        pdf.set_font("Helvetica", "", 8)
        for row in rows:
            for i, cell in enumerate(row):
                text = _txt(cell)[:42]
                pdf.cell(widths[i], 6, text, border=1)
            pdf.ln()

    sales_rows = [
        [
            s.get("sale_code", ""),
            s.get("participant_name", ""),
            _br_money(float(s.get("amount") or 0)),
            s.get("status", ""),
        ]
        for s in preview.get("sales") or []
    ]
    table_section("Vendas", ["Código", "Agente", "Valor", "Status"], sales_rows, [25, 55, 35, 30])

    expense_rows = [
        [
            e.get("expense_type", ""),
            _br_money(float(e.get("amount") or 0)),
            (e.get("notes") or "")[:30],
        ]
        for e in preview.get("expenses") or []
    ]
    table_section("Despesas", ["Tipo", "Valor", "Obs."], expense_rows, [40, 35, 70])

    commission_rows = [
        [c.get("user_name", ""), _br_money(float(c.get("commission_amount") or 0))]
        for c in preview.get("commissions") or []
    ]
    table_section("Comissoes", ["Nome", "Valor"], commission_rows, [90, 55])

    payment_rows = [
        [
            p.get("participant_name", ""),
            _br_money(float(p.get("final_amount") or 0)),
            p.get("status", ""),
        ]
        for p in preview.get("payments") or []
    ]
    table_section("Pagamentos", ["Gerente", "Valor", "Status"], payment_rows, [70, 40, 35])

    buf = BytesIO()
    pdf.output(buf)
    return buf.getvalue()
