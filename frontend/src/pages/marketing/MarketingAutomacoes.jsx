import { AutomationIcon } from "../../components/Icons";

export default function MarketingAutomacoes() {
  return (
    <div>
      <div className="page-header archive-header">
        <div>
          <h3 className="section-title archive-header-title">
            <AutomationIcon size={22} className="archive-title-icon" />
            Automações
          </h3>
          <p className="hint">Automações de marketing deste projeto — em configuração.</p>
        </div>
        <div className="view-toggle">
          <button type="button" className="btn btn-sm btn-primary" disabled>
            ☰ Lista
          </button>
          <button type="button" className="btn btn-sm btn-ghost" disabled>
            ⊞ Galeria
          </button>
        </div>
      </div>

      <div className="table-wrap card">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Descrição</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={4} className="muted center">
                Nenhuma automação configurada ainda.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
