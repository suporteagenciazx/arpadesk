"""Semana operacional (segunda a sexta) — mesma regra do frontend (lib/calendar.js)."""

from __future__ import annotations

from datetime import date, timedelta


def monday_of_week(ref: date) -> date:
    """Segunda-feira da semana civil ISO."""
    return ref - timedelta(days=ref.weekday())


def operational_week_range(ref: date | None = None) -> tuple[date, date]:
    """Segunda a sexta da semana que contém ref (padrão: hoje)."""
    ref = ref or date.today()
    monday = monday_of_week(ref)
    friday = monday + timedelta(days=4)
    return monday, friday


def shift_operational_week(start: date, end: date, weeks_delta: int) -> tuple[date, date]:
    delta = timedelta(days=7 * weeks_delta)
    return start + delta, end + delta


def previous_operational_week(monday: date, friday: date) -> tuple[date, date]:
    return monday - timedelta(days=7), friday - timedelta(days=7)


def is_operational_week(start: date | None, end: date | None) -> bool:
    if not start or not end:
        return False
    return start.weekday() == 0 and end.weekday() == 4 and (end - start).days == 4


def iso_week_number(ref: date) -> int:
    """Número da semana ISO 8601 (alinhado ao frontend)."""
    return ref.isocalendar()[1]


def format_br_date(d: date) -> str:
    return d.strftime("%d/%m/%Y")


def report_week_description(period_start: date, period_end: date) -> str:
    week = iso_week_number(period_start)
    year = period_start.isocalendar()[0]
    return (
        f"Relatório semana {week}/{year} - "
        f"{format_br_date(period_start)} a {format_br_date(period_end)}"
    )
