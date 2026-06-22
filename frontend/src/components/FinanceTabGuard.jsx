import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { canAccessFinanceTab } from "../lib/permissions";

export default function FinanceTabGuard({ tab, children }) {
  const { user } = useAuth();
  const { projectId } = useParams();

  if (!canAccessFinanceTab(user, tab, Number(projectId))) {
    return <Navigate to={`/p/${projectId}/financeiro/vendas`} replace />;
  }

  return children;
}
