import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function App() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setHealth)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>Arpadesk</h1>
        <nav>
          <span className="nav-item active">Início</span>
          <span className="nav-item muted">Financeiro</span>
          <span className="nav-item muted">Suporte</span>
          <span className="nav-item muted">Config</span>
        </nav>
      </aside>
      <main className="content">
        <h2>Arpadesk OK</h2>
        <p className="subtitle">Scaffold inicial — stack React + FastAPI + PostgreSQL</p>
        <div className="card">
          <h3>API Health</h3>
          {error && <p className="error">Erro: {error}</p>}
          {health && (
            <pre>{JSON.stringify(health, null, 2)}</pre>
          )}
          {!health && !error && <p>Carregando...</p>}
        </div>
        <p className="hint">
          Swagger: <a href={`${API_URL}/docs`} target="_blank" rel="noreferrer">{API_URL}/docs</a>
        </p>
      </main>
    </div>
  );
}
