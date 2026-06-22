import { createContext, useContext, useEffect, useState } from "react";
import api from "../lib/api";
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("arpadesk_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("arpadesk_token");
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get("/api/auth/me", { timeout: 8000 })
      .then(({ data }) => {
        setUser(data);
        localStorage.setItem("arpadesk_user", JSON.stringify(data));
      })
      .catch((err) => {
        if (err.response?.status === 401) {
          localStorage.removeItem("arpadesk_token");
          localStorage.removeItem("arpadesk_user");
          setUser(null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/api/auth/login", { email, password });
    localStorage.setItem("arpadesk_token", data.access_token);
    localStorage.setItem("arpadesk_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("arpadesk_token");
    localStorage.removeItem("arpadesk_user");
    localStorage.removeItem("arpadesk_project");
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        isAdmin: user?.level === "admin",
        isFinanceiro: user?.level === "financeiro",
        isContador: user?.level === "contador" || user?.level === "agente",
        canRegisterSale: canRegisterSale(user?.level),
        canAccessPagamentos: user?.level === "admin",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function canRegisterSale(level) {
  return ["admin", "financeiro", "contador", "agente"].includes(level);
}

export const useAuth = () => useContext(AuthContext);
