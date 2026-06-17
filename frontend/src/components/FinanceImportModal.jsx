import { useEffect, useState } from "react";
import Modal from "./Modal";
import { useFinancePeriod } from "../context/FinancePeriodContext";
import { useToast } from "../context/ToastContext";

export default function FinanceImportModal() {
  const {
    importModalOpen,
    setImportModalOpen,
    importing,
    parseImport,
    periodStart,
    periodEnd,
  } = useFinancePeriod();
  const { notify } = useToast();
  const [importStart, setImportStart] = useState(periodStart);
  const [importEnd, setImportEnd] = useState(periodEnd);
  const [importFile, setImportFile] = useState(null);

  useEffect(() => {
    if (importModalOpen) {
      setImportStart(periodStart);
      setImportEnd(periodEnd);
      setImportFile(null);
    }
  }, [importModalOpen, periodStart, periodEnd]);

  const close = () => {
    if (!importing) setImportModalOpen(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!importFile) {
      notify("Selecione um arquivo PDF.", "error");
      return;
    }
    await parseImport(importFile, importStart, importEnd);
  };

  return (
    <Modal open={importModalOpen} title="Importar relatório (PDF)" onClose={close}>
      <form onSubmit={submit}>
        <p className="hint">
          Informe o período do relatório e anexe o PDF. Os dados serão projetados em todas as abas até você
          clicar em Salvar.
        </p>
        <div className="form-grid">
          <label>
            De
            <input
              type="date"
              value={importStart}
              onChange={(e) => setImportStart(e.target.value)}
              required
            />
          </label>
          <label>
            Até
            <input
              type="date"
              value={importEnd}
              onChange={(e) => setImportEnd(e.target.value)}
              required
            />
          </label>
        </div>
        <label className="full">
          Arquivo PDF
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
            required
          />
        </label>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" disabled={importing} onClick={close}>
            Fechar
          </button>
          <button type="submit" className="btn btn-primary" disabled={importing}>
            {importing ? "Lendo PDF..." : "Anexar e pré-visualizar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
