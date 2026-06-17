"""Testes do parser e sincronização de importação de relatório PDF."""

from pathlib import Path

from app.services.report_import import (
    _labels_match,
    collect_participant_labels,
    extract_period_commission_rows,
    is_administrator_report_label,
    normalize_label,
    purge_administrator_from_extracted,
)
from app.services.report_pdf import _parse_sale_row, extract_report_from_pdf

_FIXTURE = Path(__file__).resolve().parent / "fixtures" / "agencia2_sample.pdf"


def test_parse_sale_row_full():
    line = "ATD 06 45.814.535/0001-34 (11) 993904-6761 10+ R$ 2.100,00 OK R$ 420,00"
    row = _parse_sale_row(line)
    assert row is not None
    assert row["agent"] == "ATD 06"
    assert row["cnpj"] == "45.814.535/0001-34"
    assert row["phone"] == "(11) 993904-6761"
    assert row["sale_version"] == "10+"
    assert row["amount"] == 2100.0
    assert row["status"] == "OK"
    assert row["commission"] == 420.0


def test_parse_sale_row_without_cnpj_and_phone():
    line = "ATD 03 V1 R$ 1.663,00 OK R$ 332,60"
    row = _parse_sale_row(line)
    assert row is not None
    assert row["agent"] == "ATD 03"
    assert row["cnpj"] is None
    assert row["phone"] is None
    assert row["sale_version"] == "V1"
    assert row["amount"] == 1663.0


def test_parse_sale_row_without_version():
    line = "ATD 05 R$ 500,00 OK R$ 100,00"
    row = _parse_sale_row(line)
    assert row is not None
    assert row["sale_version"] is None
    assert row["amount"] == 500.0


def test_collect_participant_labels():
    extracted = {
        "sales_rows": [{"agent": "ATD 01"}],
        "payments": [{"role": "ATD 07"}, {"role": "FIN"}],
        "commissions_summary": [
            {"aggregate": True, "role": "Todos"},
            {"participant_label": "Contador 02", "role": "Contador 02"},
        ],
    }
    labels = collect_participant_labels(extracted)
    assert "ATD 01" in labels
    assert "ATD 07" in labels
    assert "FIN" in labels
    assert "Contador 02" in labels
    assert "Todos" not in labels


def test_agencia2_sample_pdf():
    assert _FIXTURE.is_file(), "fixture agencia2_sample.pdf ausente"
    data = extract_report_from_pdf(_FIXTURE.read_bytes())
    assert data["template"] == "agencia_fluxo_caixa"
    assert data["parse_status"] == "ok"
    assert data["fields"]["total_sales"] == 40119.0
    assert data["fields"]["ok_sales_count"] == 19
    assert len(data["sales_rows"]) == 19
    assert normalize_label(data["sales_rows"][0]["agent"]).startswith("ATD")


def test_atd_maps_to_gerente_name():
    from unittest.mock import MagicMock
    from app.models import UserLevel

    g1 = MagicMock()
    g1.name = "G1"
    g1.role_function = "Gerente"
    g1.level = UserLevel.ilustrativo
    assert _labels_match("ATD 01", g1)
    assert _labels_match("ATD 1", g1)

    g6 = MagicMock()
    g6.name = "G6"
    g6.role_function = None
    g6.level = UserLevel.ilustrativo
    assert _labels_match("ATD 06", g6)


def test_extract_period_commission_rows_atd_percent():
    extracted = {
        "fields": {"total_sales": 40119.0},
        "sales_by_agent": [
            {"code": "ATD 01", "total_amount": 1687.0, "commission": 337.4},
        ],
        "commissions_summary": [
            {"category": "FINANCEIRO", "role": "financeiro", "commission": 2005.95, "aggregate": False},
        ],
    }
    participant_map = {"ATD 01": 10, "FINANCEIRO": 20}
    rows = extract_period_commission_rows(extracted, participant_map)
    by_id = {r["participant_id"]: r for r in rows}
    assert by_id[10]["commission_percent"] == 20.0
    assert by_id[20]["commission_percent"] == 5.0


def test_is_administrator_report_label_don():
    assert is_administrator_report_label("Don")
    assert is_administrator_report_label("DON")
    assert not is_administrator_report_label("ATD 01")


def test_don_excluded_from_commissions_and_payments_rows():
    """Don = administrador: não gera linhas de comissão na importação."""
    extracted = {
        "fields": {"total_sales": 10000.0},
        "sales_by_agent": [{"code": "Don", "total_amount": 10000.0, "commission": 2000.0}],
        "commissions_summary": [
            {"role": "DON", "commission": 2000.0, "aggregate": False},
        ],
        "payments": [{"role": "DON", "base_amount": 5000.0, "final_amount": 5000.0}],
    }
    participant_map = {"DON": 1}
    rows = extract_period_commission_rows(extracted, participant_map)
    assert rows == []


def test_purge_administrator_from_extracted():
    extracted = {
        "payments": [{"role": "DON"}, {"role": "ATD 01"}],
        "commissions_summary": [
            {"role": "Don", "commission": 100, "aggregate": False},
            {"role": "Todos", "aggregate": True},
        ],
        "sync": {
            "participant_map": {"DON": 50, "ATD 01": 10},
            "created": [{"label": "Don"}],
            "period_commissions": [{"label": "Don", "commission_amount": 100}],
        },
    }
    cleaned = purge_administrator_from_extracted(extracted)
    assert len(cleaned["payments"]) == 1
    assert cleaned["payments"][0]["role"] == "ATD 01"
    assert len(cleaned["commissions_summary"]) == 1
    assert cleaned["commissions_summary"][0]["aggregate"] is True
    assert "DON" not in cleaned["sync"]["participant_map"]
    assert cleaned["sync"]["created"] == []
    assert cleaned["sync"]["period_commissions"] == []
