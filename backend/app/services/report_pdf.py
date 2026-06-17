"""Parser do PDF «AGENCIA N — Fluxo de Caixa» (template Agência2)."""

from __future__ import annotations

import io
import re
from collections import defaultdict
from typing import Any

import pdfplumber

_TEMPLATE_ID = "agencia_fluxo_caixa"

_SECTION_NAMES = ("FATURAMENTO", "COMISSÕES", "DESPESAS", "SALDO", "PAGAMENTOS")

_MONEY_RE = re.compile(r"R\$\s*([\d]{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})", re.I)
_NEG_MONEY_RE = re.compile(r"-R\$\s*([\d]{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})", re.I)

_CNPJ_RE = re.compile(r"\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}")
_PHONE_RE = re.compile(r"\(\d{2}\)\s*\d{4,5}-?\d{4}")
_VERSION_RE = re.compile(r"(V\d\+?|10\+)$", re.I)

_QTD_TOTAL_RE = re.compile(
    r"QTD\s+Vendas\s+(\d+)\s+TOTAL\s+R\$\s*([\d.]+,\d{2})(?:\s+R\$\s*([\d.]+,\d{2}))?",
    re.I,
)

_SECTION_LINE_RE = re.compile(r"Fluxo de Caixa\s+([A-ZÀ-Ú()]+)", re.I)

# Don = administrador (tratado em report_import — sem comissão/pagamento).
_PAYMENT_ROW_RE = re.compile(
    r"^(ATD\s+\d+|FIN|CT\s+\d+|Don)\s+",
    re.I,
)


def _parse_money(raw: str) -> float | None:
    try:
        return round(float(raw.replace(".", "").replace(",", ".")), 2)
    except ValueError:
        return None


def _normalize_line(line: str) -> str:
    return " ".join(line.split())


def _detect_section(line: str) -> str | None:
    if "Fluxo de Caixa" not in line:
        return None
    upper = line.upper().replace("COMISSÕES", "COMISSOES")
    for name in _SECTION_NAMES:
        key = name.upper().replace("Õ", "O")
        if key in upper.replace("Õ", "O"):
            return name
    match = _SECTION_LINE_RE.search(line)
    if match:
        return match.group(1).strip().upper()
    return None


def _parse_saldo_line(line: str, fields: dict[str, Any]) -> None:
    upper = line.upper()
    if upper.startswith("VENDAS") or " VENDAS " in f" {upper} ":
        amounts = [_parse_money(m) for m in _MONEY_RE.findall(line)]
        if amounts:
            fields["total_sales"] = amounts[0]
    if "COMISS" in upper and "BRUTO" in upper:
        amounts = [_parse_money(m) for m in _MONEY_RE.findall(line)]
        if amounts:
            fields["total_commissions"] = amounts[-1]
    if "LUCRO (BRUTO)" in upper or "LUCRO(BRUTO)" in upper.replace(" ", ""):
        amounts = [_parse_money(m) for m in _MONEY_RE.findall(line)]
        if amounts:
            fields["gross_profit"] = amounts[0]
    if "LUCRO (LIQUIDO)" in upper or "LUCRO(LIQUIDO)" in upper.replace(" ", ""):
        amounts = [_parse_money(m) for m in _MONEY_RE.findall(line)]
        if amounts:
            fields["profit"] = amounts[0]
    if upper.startswith("DESPESAS"):
        neg = _NEG_MONEY_RE.search(line)
        if neg:
            fields["total_expenses"] = _parse_money(neg.group(1))


_AGGREGATE_COMMISSION_ROLES = frozenset({"TODOS", "TODAS"})

_MONEY_ONLY_LINE_RE = re.compile(r"^R\$\s*[\d.]+,\d{2}\s*$", re.I)


def _parse_commission_summary_line(line: str, rows: list[dict]) -> None:
    if line.startswith("CATEGORIA") or line.startswith("BRUTO") or line.startswith("OTURB"):
        return
    if _MONEY_ONLY_LINE_RE.match(line):
        return
    amounts = [_parse_money(m) for m in _MONEY_RE.findall(line)]
    if not amounts:
        return

    text = line
    for match in _MONEY_RE.finditer(line):
        text = text.replace(match.group(0), " ")
    text = " ".join(text.split())
    if not text:
        return

    parts = text.split()
    category = parts[0]
    role = " ".join(parts[1:]) if len(parts) > 1 else ""
    aggregate = category.upper() == "ATENDENTE" and role.upper() in _AGGREGATE_COMMISSION_ROLES
    rows.append(
        {
            "category": category,
            "role": role,
            "participant_label": role if role else category,
            "aggregate": aggregate,
            "commission": amounts[0],
            "amounts": amounts,
        }
    )


def _parse_sale_row(line: str) -> dict[str, Any] | None:
    """
    Linha de faturamento — CNPJ e telefone são opcionais.
    Formato mínimo: ATD NN … R$ valor STATUS R$ comissão
    """
    head = re.match(r"^(ATD\s+\d+)\s+(.+)$", line, re.I)
    if not head:
        return None

    agent = head.group(1).upper()
    rest = head.group(2).strip()

    comm_match = re.search(r"R\$\s*([\d.]+,\d{2})\s*$", rest, re.I)
    if not comm_match:
        return None
    commission = _parse_money(comm_match.group(1))
    rest = rest[: comm_match.start()].strip()

    status_match = re.search(r"(\S+)\s*$", rest)
    if not status_match:
        return None
    status = status_match.group(1).upper().replace("Á", "A")
    rest = rest[: status_match.start()].strip()

    amount_match = re.search(r"R\$\s*([\d.]+,\d{2})\s*$", rest, re.I)
    if not amount_match:
        return None
    amount = _parse_money(amount_match.group(1))
    rest = rest[: amount_match.start()].strip()

    sale_version = None
    ver_match = _VERSION_RE.search(rest)
    if ver_match:
        sale_version = ver_match.group(1).upper()
        rest = rest[: ver_match.start()].strip()

    cnpj = None
    phone = None
    cnpj_match = _CNPJ_RE.search(rest)
    if cnpj_match:
        cnpj = cnpj_match.group(0)
        rest = rest.replace(cnpj, " ").strip()
    phone_match = _PHONE_RE.search(rest)
    if phone_match:
        phone = phone_match.group(0)

    return {
        "agent": agent,
        "cnpj": cnpj,
        "phone": phone,
        "sale_version": sale_version,
        "amount": amount,
        "status": status,
        "commission": commission,
    }


def _parse_expense_line(line: str, expenses: list[dict], fields: dict[str, Any]) -> None:
    upper = line.upper()
    if upper.startswith("TOTAL"):
        neg = _NEG_MONEY_RE.search(line)
        if neg:
            fields["total_expenses"] = _parse_money(neg.group(1))
        return
    if upper.startswith("CATEGORIA"):
        return
    neg = _NEG_MONEY_RE.search(line)
    if not neg:
        return
    amount = _parse_money(neg.group(1))
    desc = line.replace(neg.group(0), "").strip(" \t-")
    expenses.append({"description": desc or "Despesa", "amount": amount})


def _parse_payment_line(line: str, payments: list[dict]) -> None:
    match = _PAYMENT_ROW_RE.match(line)
    if not match:
        return
    role = match.group(1).strip().upper()
    amounts = [_parse_money(m) for m in _MONEY_RE.findall(line)]
    neg_amounts = [_parse_money(m) for m in _NEG_MONEY_RE.findall(line)]
    entry: dict[str, Any] = {"role": role, "amounts": amounts}
    if len(amounts) >= 2:
        entry["base_amount"] = amounts[0]
        entry["final_amount"] = amounts[-1]
    if len(amounts) >= 3:
        entry["adjustment"] = amounts[1]
    if neg_amounts:
        entry["fine"] = neg_amounts[0]
    payments.append(entry)


def _parse_agencia_fluxo(lines: list[str]) -> dict[str, Any]:
    fields: dict[str, Any] = {}
    sales_by_agent: dict[str, dict[str, Any]] = {}
    sales_rows: list[dict[str, Any]] = []
    commissions_summary: list[dict] = []
    expenses: list[dict] = []
    payments: list[dict] = []
    status_counts: dict[str, int] = defaultdict(int)

    section: str | None = None

    for raw in lines:
        line = _normalize_line(raw)
        if not line or line.startswith("--"):
            continue

        detected = _detect_section(line)
        if detected:
            section = detected
            continue

        if section == "FATURAMENTO":
            qtd_match = _QTD_TOTAL_RE.search(line)
            if qtd_match:
                fields["ok_sales_count"] = int(qtd_match.group(1))
                fields["total_sales"] = _parse_money(qtd_match.group(2))
                if qtd_match.group(3):
                    fields["agent_commissions_total"] = _parse_money(qtd_match.group(3))
                continue
            if line.startswith("AGT") or line.startswith("CONTADOR"):
                continue
            sale = _parse_sale_row(line)
            if sale:
                code = sale["agent"]
                amount = sale["amount"]
                commission = sale["commission"]
                status_key = sale["status"]
                status_counts[status_key] += 1
                sales_rows.append(sale)
                bucket = sales_by_agent.setdefault(
                    code,
                    {
                        "code": code,
                        "name": code,
                        "sales_count": 0,
                        "total_amount": 0.0,
                        "commission": 0.0,
                        "ok_count": 0,
                    },
                )
                if status_key == "OK" and amount is not None:
                    bucket["sales_count"] += 1
                    bucket["ok_count"] += 1
                    bucket["total_amount"] = round(bucket["total_amount"] + amount, 2)
                    if commission is not None:
                        bucket["commission"] = round(bucket["commission"] + commission, 2)

        elif section == "COMISSÕES":
            _parse_commission_summary_line(line, commissions_summary)

        elif section == "DESPESAS":
            _parse_expense_line(line, expenses, fields)

        elif section == "SALDO":
            _parse_saldo_line(line, fields)

        elif section == "PAGAMENTOS":
            if line.startswith("CARGO"):
                continue
            _parse_payment_line(line, payments)

    # Gerentes em pagamentos sem venda no faturamento → zerados
    for pay in payments:
        role = pay.get("role", "").upper().strip()
        if re.match(r"^ATD\s+\d+$", role) and role not in sales_by_agent:
            sales_by_agent[role] = {
                "code": role,
                "name": role,
                "sales_count": 0,
                "total_amount": 0.0,
                "commission": pay.get("base_amount") or 0.0,
                "ok_count": 0,
            }

    sales_list = sorted(sales_by_agent.values(), key=lambda x: x["code"])

    extracted: dict[str, Any] = {
        "template": _TEMPLATE_ID,
        "parse_status": "ok" if fields.get("total_sales") else "partial",
        "fields": fields,
        "sales_by_agent": sales_list,
        "sales_rows": sales_rows,
        "commissions_summary": commissions_summary,
        "expenses": expenses,
        "payments": payments,
        "status_counts": dict(status_counts),
        "lines": [],
        "managers": [
            {
                "name": s["name"],
                "total_amount": s["total_amount"],
                "sales_count": s["sales_count"],
                "commission": s["commission"],
            }
            for s in sales_list
        ],
    }
    return extracted


def extract_report_from_pdf(pdf_bytes: bytes) -> dict[str, Any]:
    lines: list[str] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            lines.extend(text.splitlines())

    normalized = [_normalize_line(ln) for ln in lines if _normalize_line(ln)]
    full_text = "\n".join(normalized)

    if "Fluxo de Caixa" in full_text:
        result = _parse_agencia_fluxo(lines)
        result["text_line_count"] = len(normalized)
        result["text_preview"] = full_text[:1500]
        if not result["fields"]:
            result["parse_status"] = "partial"
        return result

    return _parse_generic_fallback(normalized, full_text)


def _parse_generic_fallback(lines: list[str], full_text: str) -> dict[str, Any]:
    """Fallback heurístico para PDFs sem template reconhecido."""
    extracted: dict[str, Any] = {
        "template": "generic",
        "parse_status": "partial",
        "fields": {},
        "lines": [],
        "managers": [],
    }
    labels = [
        ("total_sales", re.compile(r"(faturamento|total\s*vendas|vendas)", re.I)),
        ("total_expenses", re.compile(r"despesas?", re.I)),
        ("total_commissions", re.compile(r"comiss", re.I)),
        ("profit", re.compile(r"lucro", re.I)),
    ]
    for line in lines:
        for key, pattern in labels:
            if key in extracted["fields"]:
                continue
            if pattern.search(line):
                amounts = [_parse_money(m) for m in _MONEY_RE.findall(line)]
                if amounts:
                    extracted["fields"][key] = amounts[-1]
    extracted["text_line_count"] = len(lines)
    extracted["text_preview"] = full_text[:1200]
    extracted["parse_status"] = "ok" if extracted["fields"] else "empty"
    return extracted


# apply_import_to_report vive em report_import.py (mescla + mapa de participantes)
