import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("arpadesk_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("arpadesk_token");
      localStorage.removeItem("arpadesk_user");
      localStorage.removeItem("arpadesk_project");
      if (!window.location.pathname.includes("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

/** Upload multipart sem forçar Content-Type JSON do axios */
export function postMultipart(url, formData, config = {}) {
  return api.post(url, formData, {
    ...config,
    headers: {
      ...(config.headers || {}),
      "Content-Type": undefined,
    },
  });
}

export default api;
