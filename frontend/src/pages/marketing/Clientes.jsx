import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { fmtDate, fmtMoney } from "../../lib/constants";
import Modal from "../../components/Modal";

const emptyEdit = {
  phone: "",
  estado: "",
  porte: "",
  opening_date: "",
  email: "",
};

export default function Clientes() {
  const { projectId } = useParams();
  const { isAdmin } = useAuth();
  const { notify } = useToast();
  const [clients, setClients] = useState([]);
  const [view, setView] = useState("list");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(emptyEdit);
  const [editTarget, setEditTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [salesOpen, setSalesOpen] = useState(false);
  const [salesRows, setSalesRows] = useState([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    setError("");
    api
      .get(`/api/projects/${projectId}/marketing/clients`)
      .then(({ data }) => setClients(data || []))
      .catch((e) => setError(e.response?.data?.detail || "Erro ao carregar clientes"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const openEdit = (row) => {
    setEditTarget(row);
    setEditForm({
      phone: row.phone || "",
      estado: row.estado || "",
      porte: row.porte || "",
      opening_date: row.opening_date || "",
      email: row.email || "",
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      await api.put(`/api/projects/${projectId}/marketing/clients/${editTarget.id}`, {
        phone: editForm.phone || null,
        estado: editForm.estado || null,
        porte: editForm.porte || null,
        opening_date: editForm.opening_date || null,
        email: editForm.email || null,
      });
      setEditOpen(false);
      load();
      notify("Cliente atualizado.", "success");
    } catch (err) {
      notify(err.response?.data?.detail || "Erro ao salvar", "error");
    } finally {
      setSaving(false);
    }
  };

  const openSales = async (row) => {
    setEditTarget(row);
    setSalesOpen(true);
    setSalesLoading(true);
    setSalesRows([]);
    try {
      const { data } = await api.get(
        `/api/projects/${projectId}/marketing/clients/${row.id}/sales`
      );
      setSalesRows(data || []);
    } catch (err) {
      notify(err.response?.data?.detail || "Erro ao carregar vendas", "error");
      setSalesOpen(false);
    } finally {
      setSalesLoading(false);
    }
  };

  const openDelete = (row) => {
    setDeleteTarget(row);
    setAdminPassword("");
    setDeleteOpen(true);
  };

  const confirmDelete = async (e) => {
    e.preventDefault();
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.post(`/api/projects/${projectId}/marketing/clients/${deleteTarget.id}/delete`, {
        admin_password: adminPassword,
      });
      setDeleteOpen(false);
      setDeleteTarget(null);
      load();
      notify("Cliente removido.", "success");
    } catch (err) {
      notify(err.response?.data?.detail || "Erro ao excluir", "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="marketing-clientes page-content-inner">
      <div className="page-header">
        <div>
          <h3 className="section-title">Clientes (CNPJ)</h3>
          <p className="hint">
            Cadastro alimentado automaticamente ao salvar o relatório da semana no Financeiro — CNPJ e
            telefone das vendas confirmadas.
          </p>
        </div>
        <div className="view-toggle">
          <button
            type="button"
            className={`btn btn-sm ${view === "gallery" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setView("gallery")}
          >
            ⊞ Galeria
          </button>
          <button
            type="button"
            className={`btn btn-sm ${view === "list" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setView("list")}
          >
            ☰ Lista
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Carregando clientes...</p>}

      {!loading && clients.length === 0 && (
        <div className="empty-state card">
          <p>Nenhum cliente registrado ainda. Salve um relatório semanal no Financeiro para importar CNPJs.</p>
        </div>
      )}

      {!loading && clients.length > 0 && view === "gallery" && (
        <div className="project-gallery permissoes-gallery">
          {clients.map((c) => (
            <div key={c.id} className="project-card permissoes-card marketing-client-card">
              <div className="project-card-body permissoes-card-body">
                <strong className="project-card-name">{c.cnpj_display}</strong>
                <span className="project-card-desc">{c.phone || "—"}</span>
                <p className="permissoes-privileges">
                  {c.sales_count} venda(s) · {fmtMoney(c.total_paid)}
                </p>
                <p className="hint-inline">
                  Registro: {c.registered_at ? fmtDate(c.registered_at) : "—"}
                </p>
              </div>
              <div className="permissoes-card-footer marketing-client-actions">
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => openEdit(c)}>
                  Editar
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => openSales(c)}>
                  Vendas
                </button>
                {isAdmin && (
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => openDelete(c)}>
                    Excluir
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && clients.length > 0 && view === "list" && (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>CNPJ</th>
                <th>Telefone</th>
                <th>Estado</th>
                <th>Porte</th>
                <th>Abertura</th>
                <th>Email</th>
                <th>Registro</th>
                <th>Vendas</th>
                <th>Total pago</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td className="nowrap">{c.cnpj_display}</td>
                  <td>{c.phone || "—"}</td>
                  <td>{c.estado || "—"}</td>
                  <td>{c.porte || "—"}</td>
                  <td className="nowrap">{c.opening_date ? fmtDate(c.opening_date) : "—"}</td>
                  <td>{c.email || "—"}</td>
                  <td className="nowrap">{c.registered_at ? fmtDate(c.registered_at) : "—"}</td>
                  <td>{c.sales_count}</td>
                  <td>{fmtMoney(c.total_paid)}</td>
                  <td className="actions">
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => openEdit(c)}>
                      Editar
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => openSales(c)}>
                      Vendas
                    </button>
                    {isAdmin && (
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => openDelete(c)}>
                        Excluir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={editOpen} title="Editar cliente" onClose={() => !saving && setEditOpen(false)}>
        {editTarget && (
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              saveEdit();
            }}
          >
            <p className="hint full">CNPJ: {editTarget.cnpj_display}</p>
            <label>
              Telefone
              <input
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </label>
            <label>
              Estado (UF)
              <input
                maxLength={2}
                value={editForm.estado}
                onChange={(e) => setEditForm({ ...editForm, estado: e.target.value.toUpperCase() })}
              />
            </label>
            <label>
              Porte
              <input
                value={editForm.porte}
                onChange={(e) => setEditForm({ ...editForm, porte: e.target.value })}
              />
            </label>
            <label>
              Data de abertura
              <input
                type="date"
                value={editForm.opening_date}
                onChange={(e) => setEditForm({ ...editForm, opening_date: e.target.value })}
              />
            </label>
            <label className="full">
              Email
              <input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </label>
            <div className="form-actions full">
              <button type="button" className="btn btn-ghost" onClick={() => setEditOpen(false)} disabled={saving}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={saveEdit}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={salesOpen}
        title={editTarget ? `Vendas — ${editTarget.cnpj_display}` : "Vendas"}
        onClose={() => setSalesOpen(false)}
        wide
      >
        {salesLoading ? (
          <p className="muted">Carregando vendas...</p>
        ) : salesRows.length === 0 ? (
          <p className="muted">Nenhuma venda confirmada para este CNPJ.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Data</th>
                  <th>Telefone</th>
                  <th>Valor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {salesRows.map((s) => (
                  <tr key={s.id}>
                    <td>{s.sale_code}</td>
                    <td>{s.sale_date ? fmtDate(s.sale_date) : "—"}</td>
                    <td>{s.phone || "—"}</td>
                    <td>{fmtMoney(s.amount)}</td>
                    <td>{s.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      <Modal open={deleteOpen} title="Excluir cliente" onClose={() => !deleting && setDeleteOpen(false)}>
        {deleteTarget && (
          <form onSubmit={confirmDelete}>
            <p>
              Excluir o cliente <strong>{deleteTarget.cnpj_display}</strong> da base de marketing?
            </p>
            <label>
              Senha de administrador
              <input
                type="password"
                required
                autoComplete="current-password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
              />
            </label>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-danger" disabled={deleting}>
                {deleting ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
