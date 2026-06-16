import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProjectProvider } from "./context/ProjectContext";
import { ThemeProvider } from "./context/ThemeContext";
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
import Suporte from "./pages/Suporte";
import Usuarios from "./pages/config/Usuarios";
import Telegram from "./pages/config/Telegram";

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
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
                <Route path="/financeiro" element={<FinanceProjects />} />
                <Route path="/suporte" element={<Suporte />} />
                <Route path="/config/usuarios" element={<Usuarios />} />
                <Route path="/config/telegram" element={<Telegram />} />
                <Route path="/p/:projectId/financeiro" element={<FinanceLayout />}>
                  <Route index element={<Navigate to="vendas" replace />} />
                  <Route path="vendas" element={<Vendas />} />
                  <Route path="despesas" element={<Despesas />} />
                  <Route path="comissoes" element={<Comissoes />} />
                  <Route path="pagamentos" element={<Pagamentos />} />
                  <Route path="relatorio" element={<Relatorio />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/financeiro" replace />} />
            </Routes>
          </BrowserRouter>
        </ProjectProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
