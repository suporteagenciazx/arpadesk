import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../lib/api";
import FinanceTabGuard from "../../components/FinanceTabGuard";
import Modal from "../../components/Modal";
import { FilesIcon, DownloadIcon, PencilIcon, ChevronLeftIcon, ChevronRightIcon } from "../../components/Icons";
import { useFinancePeriod } from "../../context/FinancePeriodContext";
import { useCashClosing } from "../../context/CashClosingContext";
import { fmtMoney } from "../../lib/constants";
import { setReportEditSession } from "../../lib/reportEditSession";

const PAGE_SIZE = 20;

export default function Arquivo() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const period = useFinancePeriod();
  const { refreshClosing } = useCashClosing();
  const [rows, setRows] = useState([]);
  const [view, setView] = useState("list");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [downloadingKey, setDownloadingKey] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editPassword, setEditPassword] = useState("");
  const [editing, setEditing] = useState(false);

  const load = () => {
    setLoading(true);
    setError("");
    api
      .get(`/api/projects/${projectId}/report-archive`)
      .then(({ data }) => setRows(data || []))
      .catch((e) => setError(e.response?.data?.detail || "Erro ao carregar arquivo"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [projectId]);

  useEffect(() => {
    setPage(1);
  }, [search, view]);

  const rowKey = (row) => `${row.id || "x"}-${row.period_start}`;

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const haystack = [
        row.id,
        row.description,
        row.period_start,
        row.period_end,
        String(row.sales_count),
        String(row.billing_total),
        String(row.profit),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const downloadPdf = async (row) => {
    const key = rowKey(row);
    setDownloadingKey(key);
    setError("");
    try {
      const { data } = await api.get(`/api/projects/${projectId}/report-archive/pdf`, {
        params: { period_start: row.period_start, period_end: row.period_end },
        responseType: "blob",
      });
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `relatorio_${row.period_start}_${row.period_end}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao baixar PDF");
    } finally {
      setDownloadingKey(null);
    }
  };

  const openEdit = (row) => {
    setEditTarget(row);
    setEditPassword("");
    setError("");
  };

  const confirmEdit = async (e) => {
    e.preventDefault();
    if (!editTarget) return;
    setEditing(true);
    setError("");
    try {
      await api.post(
        `/api/projects/${projectId}/report-archive/reopen-for-edit`,
        { admin_password: editPassword },
        { params: { period_start: editTarget.period_start, period_end: editTarget.period_end } }
      );
      period.openPeriodForEdit(editTarget.period_start, editTarget.period_end);
      setReportEditSession(projectId, editTarget.period_start, editTarget.period_end);
      await refreshClosing();
      setEditTarget(null);
      setEditPassword("");
      navigate(`/p/${projectId}/financeiro/relatorio`);
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao reabrir relatório");
    } finally {
      setEditing(false);
    }
  };

  const downloadButton = (row) => (
    <button
      type="button"
      className="btn btn-sm btn-ghost archive-download-btn"
      title="Baixar PDF do relatório"
      aria-label="Baixar PDF do relatório"
      disabled={downloadingKey === rowKey(row)}
      onClick={() => downloadPdf(row)}
    >
      <DownloadIcon size={16} />
      {downloadingKey === rowKey(row) ? "..." : "PDF"}
    </button>
  );

  const editButton = (row) => (
    <button
      type="button"
      className="btn-icon project-action-btn archive-edit-btn"
      title="Editar relatório"
      aria-label="Editar relatório"
      onClick={() => openEdit(row)}
    >
      <PencilIcon size={15} />
    </button>
  );

  const paginationBar = (
    <div className="archive-pagination">
      <span className="muted archive-pagination-info">
        {filteredRows.length === 0
          ? "Nenhum relatório"
          : `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filteredRows.length)} de ${filteredRows.length}`}
      </span>
      <div className="archive-pagination-actions">
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={currentPage <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          aria-label="Página anterior"
        >
          <ChevronLeftIcon size={16} />
        </button>
        <span className="archive-pagination-page">
          {currentPage} / {totalPages}
        </span>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={currentPage >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          aria-label="Próxima página"
        >
          <ChevronRightIcon size={16} />
        </button>
      </div>
    </div>
  );

  return (
    <FinanceTabGuard tab="arquivo">
      <div>
        <div className="page-header archive-header">
          <div>
            <h3 className="section-title archive-header-title">
              <FilesIcon size={22} className="archive-title-icon" />
              Arquivo de relatórios
            </h3>
            <p className="hint">Histórico de todas as semanas salvas no projeto.</p>
          </div>
          <div className="view-toggle">
            <button
              type="button"
              className={`btn btn-sm ${view === "list" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setView("list")}
            >
              ☰ Lista
            </button>
            <button
              type="button"
              className={`btn btn-sm ${view === "gallery" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setView("gallery")}
            >
              ⊞ Galeria
            </button>
          </div>
        </div>

        <div className="archive-toolbar">
          <label className="archive-search">
            <span className="sr-only">Pesquisar relatórios</span>
            <input
              type="search"
              placeholder="Pesquisar por ID, descrição, data..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>

        {error && <p className="error">{error}</p>}

        {loading ? (
          <p className="muted">Carregando relatórios...</p>
        ) : view === "gallery" ? (
          <>
            <div className="archive-gallery">
              {pageRows.map((row) => (
                <article key={rowKey(row)} className="archive-card card">
                  <div className="archive-card-top">
                    <code className="archive-card-code">{row.id || "—"}</code>
                    {editButton(row)}
                  </div>
                  <p className="archive-card-desc">{row.description}</p>
                  <div className="archive-card-metrics">
                    <div>
                      <span className="archive-card-label">Faturamento</span>
                      <strong className="archive-card-billing">{fmtMoney(row.billing_total)}</strong>
                    </div>
                    <div>
                      <span className="archive-card-label">Lucro</span>
                      <strong
                        className={`archive-card-profit ${row.profit < 0 ? "archive-card-profit--neg" : ""}`}
                      >
                        {fmtMoney(row.profit)}
                      </strong>
                    </div>
                  </div>
                  <div className="archive-card-footer">{downloadButton(row)}</div>
                </article>
              ))}
              {pageRows.length === 0 && (
                <div className="empty-state card archive-gallery-empty">
                  <p>Nenhum relatório encontrado.</p>
                </div>
              )}
            </div>
            {paginationBar}
          </>
        ) : (
          <>
            <div className="table-wrap">
              <table className="archive-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Descrição</th>
                    <th>Faturamento</th>
                    <th>Despesa</th>
                    <th>Qtd. vendas</th>
                    <th>Lucro</th>
                    <th>Relatório</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={rowKey(row)}>
                      <td>
                        <code>{row.id || "—"}</code>
                      </td>
                      <td className="archive-desc-cell">
                        <span>{row.description}</span>
                        {editButton(row)}
                      </td>
                      <td className="archive-billing-cell">{fmtMoney(row.billing_total)}</td>
                      <td className="negative">{fmtMoney(-row.expenses_total)}</td>
                      <td>{row.sales_count}</td>
                      <td className={row.profit >= 0 ? "profit-positive" : "negative"}>
                        {fmtMoney(row.profit)}
                      </td>
                      <td className="archive-pdf-cell">{downloadButton(row)}</td>
                    </tr>
                  ))}
                  {pageRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="muted center">
                        Nenhum relatório encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {paginationBar}
          </>
        )}

        <Modal
          open={Boolean(editTarget)}
          title="Editar relatório"
          onClose={() => !editing && setEditTarget(null)}
        >
          {editTarget && (
            <form onSubmit={confirmEdit}>
              <p>
                Reabrir o período <strong>{editTarget.description}</strong> para visualização e edição?
                Vendas e despesas serão destravadas no filtro Atual da semana selecionada.
              </p>
              <label>
                Senha de administrador
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                />
              </label>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={editing}
                  onClick={() => setEditTarget(null)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={editing}>
                  {editing ? "Abrindo..." : "Confirmar e abrir"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      </div>
    </FinanceTabGuard>
  );
}
