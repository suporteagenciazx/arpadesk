/** Switch visual reutilizável (padrão Automacoes/Telegram). */
export default function Switch({
  checked,
  onChange,
  disabled = false,
  label,
  id,
  className = "",
}) {
  const switchBtn = (
    <button
      type="button"
      id={id}
      className={`switch ${checked ? "on" : ""} ${className}`.trim()}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!checked)}
    >
      <span className="switch-thumb" />
    </button>
  );

  if (!label) return switchBtn;

  return (
    <div className="settings-row">
      <div className="settings-row-text">{label}</div>
      {switchBtn}
    </div>
  );
}
