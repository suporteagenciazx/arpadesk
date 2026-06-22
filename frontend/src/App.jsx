import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProjectProvider } from "./context/ProjectContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";
import { SectorsProvider } from "./context/SectorsContext";
import SectorAccessGuard from "./components/SectorAccessGuard";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import FinanceProjects from "./pages/finance/FinanceProjects";
import FinanceLayout from "./pages/finance/FinanceLayout";
import Vendas from "./pages/finance/Vendas";
import Despesas from "./pages/finance/Despesas";
import Comissoes from "./pages/finance/Comissoes";
import Pagamentos from "./pages/finance/Pagamentos";
import Relatorio from "./pages/finance/Relatorio";
import Arquivo from "./pages/finance/Arquivo";
import Automacoes from "./pages/finance/Automacoes";
import Permissoes from "./pages/project/Permissoes";
import Suporte from "./pages/Suporte";
import Usuarios from "./pages/config/Usuarios";
import MarketingProjects from "./pages/marketing/MarketingProjects";
import MarketingLayout from "./pages/marketing/MarketingLayout";
import Campanhas from "./pages/marketing/Campanhas";
import MarketingRelatorio from "./pages/marketing/MarketingRelatorio";
import Clientes from "./pages/marketing/Clientes";
import MarketingAutomacoes from "./pages/marketing/MarketingAutomacoes";
import Telegram from "./pages/config/Telegram";
import GestaoLayout from "./pages/gestao/GestaoLayout";
import GestaoDashboard from "./pages/gestao/GestaoDashboard";
import GestaoProjetos from "./pages/gestao/GestaoProjetos";
import GestaoConfiguracoes from "./pages/gestao/GestaoConfiguracoes";

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <SectorsProvider>
          <ProjectProvider>
          <BrowserRouter
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/financeiro" replace />} />
                <Route
                  path="/financeiro"
                  element={
                    <SectorAccessGuard sectorId="financeiro">
                      <FinanceProjects />
                    </SectorAccessGuard>
                  }
                />
                <Route
                  path="/marketing"
                  element={
                    <SectorAccessGuard sectorId="marketing">
                      <MarketingProjects />
                    </SectorAccessGuard>
                  }
                />
                <Route path="/gestao" element={<GestaoLayout />}>
                  <Route index element={<GestaoDashboard />} />
                  <Route path="projetos" element={<GestaoProjetos />} />
                  <Route path="configuracoes" element={<GestaoConfiguracoes />} />
                </Route>
                <Route
                  path="/suporte"
                  element={
                    <SectorAccessGuard sectorId="suporte">
                      <Suporte />
                    </SectorAccessGuard>
                  }
                />
                <Route path="/config/usuarios" element={<Usuarios />} />
                <Route path="/config/telegram" element={<Telegram />} />
                <Route
                  path="/p/:projectId/financeiro"
                  element={
                    <SectorAccessGuard sectorId="financeiro">
                      <FinanceLayout />
                    </SectorAccessGuard>
                  }
                >
                  <Route index element={<Navigate to="vendas" replace />} />
                  <Route path="vendas" element={<Vendas />} />
                  <Route path="despesas" element={<Despesas />} />
                  <Route path="comissoes" element={<Comissoes />} />
                  <Route path="pagamentos" element={<Pagamentos />} />
                  <Route path="relatorio" element={<Relatorio />} />
                  <Route path="arquivo" element={<Arquivo />} />
                  <Route path="automacoes" element={<Automacoes />} />
                  <Route path="permissoes" element={<Permissoes />} />
                </Route>
                <Route
                  path="/p/:projectId/marketing"
                  element={
                    <SectorAccessGuard sectorId="marketing">
                      <MarketingLayout />
                    </SectorAccessGuard>
                  }
                >
                  <Route index element={<Navigate to="campanhas" replace />} />
                  <Route path="campanhas" element={<Campanhas />} />
                  <Route path="relatorio" element={<MarketingRelatorio />} />
                  <Route path="clientes" element={<Clientes />} />
                  <Route path="automacoes" element={<MarketingAutomacoes />} />
                  <Route path="permissoes" element={<Permissoes />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/financeiro" replace />} />
            </Routes>
          </BrowserRouter>
        </ProjectProvider>
          </SectorsProvider>
      </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
