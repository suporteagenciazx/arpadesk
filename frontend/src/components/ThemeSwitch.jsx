import { useTheme } from "../context/ThemeContext";

export default function ThemeSwitch({ collapsed }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <label
      className={`theme-switch${collapsed ? " theme-switch--collapsed" : ""}`}
      title={isDark ? "Modo claro" : "Modo escuro"}
    >
      <span className="theme-switch-label" aria-hidden={collapsed}>
        {isDark ? "Escuro" : "Claro"}
      </span>
      <button
        type="button"
        role="switch"
        className="theme-switch-control"
        aria-checked={isDark}
        aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
        onClick={toggleTheme}
      >
        <span className="theme-switch-track">
          <span className="theme-switch-thumb" />
        </span>
      </button>
    </label>
  );
}
