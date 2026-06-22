import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import { DownloadIcon, PencilIcon, TrashIcon } from "../../components/Icons";
import { useToast } from "../../context/ToastContext";
import { fmtDate, fmtMoney } from "../../lib/constants";

const PAGE_SIZE = 15;

function fmtPeriod(start, end) {
  if (!start || !end) return "—";
  return `${fmtDate(start)} — ${fmtDate(end)}`;
}

export default function Campanhas() {
  const { projectId } = useParams();
  const { notify } = useToast();
  const [rows, setRows] = useState([]);
  const [expenseMode, setExpenseMode] = useState("marketing");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [listsOpen, setListsOpen] = useState(false);
  const [listsWeek, setListsWeek] = useState(null);
  const [lists, setLists] = useState([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [listFormOpen, setListFormOpen] = useState(false);
  const [listForm, setListForm] = useState({
    channel: "sms",
    name: "",
    exported_at: "",
    sent_at: "",
    investment_amount: "",
    message_count: "",
  });
  const [savingList, setSavingList] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);

  const [editClientsRow, setEditClientsRow] = useState(null);
  const [editClientsValue, setEditClientsValue] = useState("");
  const [savingClients, setSavingClients] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api
      .get(`/api/projects/${projectId}/marketing/weeks`, { params: { expense_mode: expenseMode } })
      .then(({ data }) => setRows(data || []))
      .catch((e) => setError(e.response?.data?.detail || "Erro ao carregar campanhas"))
      .finally(() => setLoading(false));
  }, [projectId, expenseMode]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, expenseMode]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.description, row.month_label, row.period_start, row.period_end, String(row.clients_received)]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const openLists = async (row) => {
    setListsWeek(row);
    setListsOpen(true);
    setListsLoading(true);
    try {
      const { data } = await api.get(`/api/projects/${projectId}/marketing/weeks/lists`, {
        params: { period_start: row.period_start, period_end: row.period_end },
      });
      setLists(data || []);
    } catch (e) {
      notify(e.response?.data?.detail || "Erro ao carregar listas", "error");
      setLists([]);
    } finally {
      setListsLoading(false);
    }
  };

  const reloadLists = async () => {
    if (!listsWeek) return;
    const { data } = await api.get(`/api/projects/${projectId}/marketing/weeks/lists`, {
      params: { period_start: listsWeek.period_start, period_end: listsWeek.period_end },
    });
    setLists(data || []);
    load();
  };

  const saveList = async (e) => {
    e.preventDefault();
    if (!listsWeek) return;
    setSavingList(true);
    try {
      await api.post(`/api/projects/${projectId}/marketing/weeks/lists`, {
        period_start: listsWeek.period_start,
        period_end: listsWeek.period_end,
        channel: listForm.channel,
        name: listForm.name.trim(),
        exported_at: listForm.exported_at || null,
        sent_at: listForm.sent_at || null,
        investment_amount: parseFloat(String(listForm.investment_amount).replace(",", ".")) || 0,
        message_count: parseInt(listForm.message_count, 10) || 0,
      });
      setListFormOpen(false);
      setListForm({
        channel: "sms",
        name: "",
        exported_at: "",
        sent_at: "",
        investment_amount: "",
        message_count: "",
      });
      await reloadLists();
      notify("Lista adicionada.", "success");
    } catch (err) {
      notify(err.response?.data?.detail || "Erro ao salvar lista", "error");
    } finally {
      setSavingList(false);
    }
  };

  const removeList = async (listId) => {
    if (!window.confirm("Excluir esta lista?")) return;
    try {
      await api.delete(`/api/projects/${projectId}/marketing/lists/${listId}`);
      await reloadLists();
      notify("Lista removida.", "success");
    } catch (err) {
      notify(err.response?.data?.detail || "Erro ao excluir", "error");
    }
  };

  const uploadAttachment = async (listId, file) => {
    if (!file) return;
    setUploadingId(listId);
    try {
      const form = new FormData();
      form.append("file", file);
      await api.post(`/api/projects/${projectId}/marketing/lists/${listId}/attachment`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await reloadLists();
      notify("Anexo enviado.", "success");
    } catch (err) {
      notify(err.response?.data?.detail || "Erro no upload", "error");
    } finally {
      setUploadingId(null);
    }
  };

  const downloadAttachment = async (listId) => {
    try {
      const res = await api.get(`/api/projects/${projectId}/marketing/lists/${listId}/attachment/download`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lista-${listId}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      notify(err.response?.data?.detail || "Erro ao baixar", "error");
    }
  };

  const saveClientsReceived = async () => {
    if (!editClientsRow) return;
    setSavingClients(true);
    try {
      const val = editClientsValue.trim();
      const parsed = val === "" ? null : parseInt(val, 10);
      if (val !== "" && (Number.isNaN(parsed) || parsed < 0)) {
        notify("Informe um número válido ou deixe em branco.", "error");
        return;
      }
      await api.patch(`/api/projects/${projectId}/marketing/weeks/clients-received`, {
        period_start: editClientsRow.period_start,
        period_end: editClientsRow.period_end,
        clients_received: parsed,
      });
      setEditClientsRow(null);
      load();
      notify("Clientes recebidos atualizados.", "success");
    } catch (err) {
      notify(err.response?.data?.detail || "Erro ao salvar", "error");
    } finally {
      setSavingClients(false);
    }
  };

  return (
    <div className="marketing-campanhas page-content-inner">
      <div className="archive-toolbar">
        <input
          type="search"
          className="archive-search"
          placeholder="Buscar campanha, mês, período..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="marketing-expense-toggle">
          <span>Investimento:</span>
          <button
            type="button"
            className={`toggle-chip ${expenseMode === "marketing" ? "active" : ""}`}
            onClick={() => setExpenseMode("marketing")}
          >
            Divulgação
          </button>
          <button
            type="button"
            className={`toggle-chip ${expenseMode === "all" ? "active" : ""}`}
            onClick={() => setExpenseMode("all")}
          >
            Despesas gerais
          </button>
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Carregando...</p>}

      {!loading && (
        <div className="table-wrap archive-table-wrap">
          <table className="archive-table marketing-table">
            <thead>
              <tr>
                <th>Campanha</th>
                <th>Mês</th>
                <th>SMS / WhatsApp</th>
                <th>Clientes recebidos</th>
                <th>Investimento</th>
                <th>Faturamento</th>
                <th>Lucro</th>
                <th>Período</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted">
                    Nenhuma semana registrada ainda.
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr key={`${row.period_start}-${row.period_end}`}>
                    <td>
                      <strong>{row.description}</strong>
                      {row.report_saved && <span className="badge badge-sm">Relatório salvo</span>}
                    </td>
                    <td>{row.month_label}</td>
                    <td>
                      <div className="marketing-sms-cell">
                        <span>
                          {row.messages_sent_total > 0
                            ? `${row.messages_sent_total} (${row.sms_sent_total} SMS · ${row.whatsapp_sent_total} WA)`
                            : "—"}
                        </span>
                        <button type="button" className="btn btn-ghost btn-xs" onClick={() => openLists(row)}>
                          Listas{row.list_count > 0 ? ` (${row.list_count})` : ""}
                        </button>
                      </div>
                    </td>
                    <td>
                      <span className="marketing-clients-cell">
                        {row.clients_received != null ? row.clients_received : "—"}
                        <button
                          type="button"
                          className="icon-btn"
                          title="Editar clientes recebidos"
                          onClick={() => {
                            setEditClientsRow(row);
                            setEditClientsValue(
                              row.clients_received != null ? String(row.clients_received) : ""
                            );
                          }}
                        >
                          <PencilIcon size={14} />
                        </button>
                      </span>
                    </td>
                    <td>{fmtMoney(row.investment_amount)}</td>
                    <td>{fmtMoney(row.billing_total)}</td>
                    <td className={row.profit >= 0 ? "positive" : "negative"}>{fmtMoney(row.profit)}</td>
                    <td className="nowrap">{fmtPeriod(row.period_start, row.period_end)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="archive-pagination">
          <button type="button" className="btn btn-ghost btn-sm" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </button>
          <span className="muted">
            Página {currentPage} de {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </button>
        </div>
      )}

      <Modal
        open={listsOpen}
        title={listsWeek ? `Listas — ${listsWeek.description}` : "Listas"}
        wide
        onClose={() => {
          setListsOpen(false);
          setListFormOpen(false);
        }}
      >
        {listsLoading ? (
          <p className="muted">Carregando listas...</p>
        ) : (
          <>
            <div className="form-actions" style={{ justifyContent: "flex-start", marginBottom: "1rem" }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setListFormOpen(true)}>
                + Nova lista
              </button>
            </div>

            {listFormOpen && (
              <form className="marketing-list-form card-panel" onSubmit={saveList}>
                <div className="form-grid">
                  <label>
                    Canal
                    <select value={listForm.channel} onChange={(e) => setListForm((f) => ({ ...f, channel: e.target.value }))}>
                      <option value="sms">SMS</option>
                      <option value="whatsapp">WhatsApp</option>
                    </select>
                  </label>
                  <label>
                    Nome da lista
                    <input
                      value={listForm.name}
                      onChange={(e) => setListForm((f) => ({ ...f, name: e.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    Data exportação
                    <input
                      type="date"
                      value={listForm.exported_at}
                      onChange={(e) => setListForm((f) => ({ ...f, exported_at: e.target.value }))}
                    />
                  </label>
                  <label>
                    Data envio
                    <input
                      type="date"
                      value={listForm.sent_at}
                      onChange={(e) => setListForm((f) => ({ ...f, sent_at: e.target.value }))}
                    />
                  </label>
                  <label>
                    Valor investido
                    <input
                      value={listForm.investment_amount}
                      onChange={(e) => setListForm((f) => ({ ...f, investment_amount: e.target.value }))}
                      placeholder="0,00"
                    />
                  </label>
                  <label>
                    Qtd. mensagens
                    <input
                      type="number"
                      min="0"
                      value={listForm.message_count}
                      onChange={(e) => setListForm((f) => ({ ...f, message_count: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setListFormOpen(false)}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={savingList}>
                    {savingList ? "Salvando..." : "Salvar lista"}
                  </button>
                </div>
              </form>
            )}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Lista</th>
                    <th>Canal</th>
                    <th>Exportação</th>
                    <th>Envio</th>
                    <th>Investido</th>
                    <th>Mensagens</th>
                    <th>Anexo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lists.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="muted">
                        Nenhuma lista nesta semana.
                      </td>
                    </tr>
                  ) : (
                    lists.map((lst) => (
                      <tr key={lst.id}>
                        <td>{lst.name}</td>
                        <td>{lst.channel === "whatsapp" ? "WhatsApp" : "SMS"}</td>
                        <td>{lst.exported_at ? fmtDate(lst.exported_at) : "—"}</td>
                        <td>{lst.sent_at ? fmtDate(lst.sent_at) : "—"}</td>
                        <td>{fmtMoney(lst.investment_amount)}</td>
                        <td>{lst.message_count}</td>
                        <td>
                          {lst.has_attachment ? (
                            <button type="button" className="btn btn-ghost btn-xs" onClick={() => downloadAttachment(lst.id)}>
                              <DownloadIcon size={14} />
                              Baixar
                            </button>
                          ) : (
                            <label className="btn btn-ghost btn-xs upload-label">
                              {uploadingId === lst.id ? "Enviando..." : "Anexar"}
                              <input
                                type="file"
                                hidden
                                disabled={uploadingId === lst.id}
                                onChange={(e) => uploadAttachment(lst.id, e.target.files?.[0])}
                              />
                            </label>
                          )}
                        </td>
                        <td>
                          <button type="button" className="icon-btn danger" title="Excluir" onClick={() => removeList(lst.id)}>
                            <TrashIcon size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={Boolean(editClientsRow)}
        title="Clientes recebidos"
        onClose={() => setEditClientsRow(null)}
      >
        <p className="hint">
          Período: {editClientsRow ? fmtPeriod(editClientsRow.period_start, editClientsRow.period_end) : ""}
        </p>
        <p className="hint">
          Também pode ser informado no fechamento de caixa ou ao salvar o relatório. Deixe em branco se ainda não souber.
        </p>
        <label>
          Quantidade de clientes recebidos
          <input
            type="number"
            min="0"
            placeholder="Em branco = não informado"
            value={editClientsValue}
            onChange={(e) => setEditClientsValue(e.target.value)}
          />
        </label>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setEditClientsRow(null)}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={savingClients} onClick={saveClientsReceived}>
            {savingClients ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
