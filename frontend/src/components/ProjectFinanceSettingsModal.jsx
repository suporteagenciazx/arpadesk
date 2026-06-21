import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import Modal from "./Modal";
import {
  BONUS_PERIOD_OPTIONS,
  BONUS_RULE_TYPES,
  CLOSING_MODE_OPTIONS,
  REWARD_TYPE_OPTIONS,
  WEEKDAY_OPTIONS,
  buildCurrentWeekOverride,
  emptyBonusRule,
  getOperationalWeekRange,
} from "../lib/financeConfig";
import { getMondayOfWeek, toLocalIso, addDays, parseLocalDate } from "../lib/calendar";

const emptyForm = () => ({
  closing_schedule: {
    weekly: {
      default_weekday: 5,
      default_time: "20:00",
      mode: "both",
      current_week: null,
    },
    daily: {
      enabled: false,
      time: "20:00",
      mode: "manual",
    },
  },
  bonus_rules: [],
});

export default function ProjectFinanceSettingsModal({ open, onClose, projectId, periodStart, periodEnd, onSaved }) {
  const [form, setForm] = useState(emptyForm);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [useWeekOverride, setUseWeekOverride] = useState(false);
  const [overrideEndDay, setOverrideEndDay] = useState(5);
  const [overrideTime, setOverrideTime] = useState("20:00");

  const weekMonday = useMemo(() => {
    if (periodStart) return periodStart;
    const monday = getMondayOfWeek(new Date());
    return toLocalIso(monday);
  }, [periodStart, open]);

  useEffect(() => {
    if (!open || !projectId) return;
    setLoading(true);
    setError("");
    api
      .get(`/api/projects/${projectId}/finance-config`)
      .then(({ data }) => {
        setForm({
          closing_schedule: data.closing_schedule,
          bonus_rules: data.bonus_rules || [],
        });
        setMembers(data.members || []);
        const cw = data.closing_schedule?.weekly?.current_week;
        if (cw?.period_start === weekMonday) {
          setUseWeekOverride(true);
          const endDate = parseLocalDate(cw.period_end);
          const jsDay = endDate?.getDay();
          setOverrideEndDay(jsDay >= 1 && jsDay <= 5 ? jsDay : 5);
          setOverrideTime(cw.closing_time || "20:00");
        } else {
          setUseWeekOverride(false);
          setOverrideEndDay(data.closing_schedule?.weekly?.default_weekday ?? 5);
          setOverrideTime(data.closing_schedule?.weekly?.default_time ?? "20:00");
        }
      })
      .catch((e) => setError(e.response?.data?.detail || "Erro ao carregar configurações"))
      .finally(() => setLoading(false));
  }, [open, projectId, weekMonday]);

  const setWeekly = (patch) => {
    setForm((f) => ({
      ...f,
      closing_schedule: {
        ...f.closing_schedule,
        weekly: { ...f.closing_schedule.weekly, ...patch },
      },
    }));
  };

  const setDaily = (patch) => {
    setForm((f) => ({
      ...f,
      closing_schedule: {
        ...f.closing_schedule,
        daily: { ...f.closing_schedule.daily, ...patch },
      },
    }));
  };

  const addBonusRule = () => {
    setForm((f) => ({ ...f, bonus_rules: [...f.bonus_rules, emptyBonusRule()] }));
  };

  const updateBonusRule = (id, patch) => {
    setForm((f) => ({
      ...f,
      bonus_rules: f.bonus_rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  };

  const removeBonusRule = (id) => {
    setForm((f) => ({ ...f, bonus_rules: f.bonus_rules.filter((r) => r.id !== id) }));
  };

  const toggleParticipant = (ruleId, userId) => {
    setForm((f) => ({
      ...f,
      bonus_rules: f.bonus_rules.map((r) => {
        if (r.id !== ruleId) return r;
        const ids = r.participant_ids || [];
        const next = ids.includes(userId) ? ids.filter((x) => x !== userId) : [...ids, userId];
        return { ...r, participant_ids: next };
      }),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const weekly = { ...form.closing_schedule.weekly };
    if (useWeekOverride) {
      const monday = parseLocalDate(weekMonday);
      const endIso = toLocalIso(addDays(monday, overrideEndDay - 1));
      weekly.current_week = buildCurrentWeekOverride(weekMonday, endIso, overrideTime);
    } else {
      weekly.current_week = null;
    }
    try {
      const { data } = await api.patch(`/api/projects/${projectId}/finance-config`, {
        closing_schedule: {
          weekly,
          daily: form.closing_schedule.daily,
        },
        bonus_rules: form.bonus_rules,
      });
      onSaved?.(data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const previewMonday = parseLocalDate(weekMonday);
  const previewRange = getOperationalWeekRange(previewMonday || new Date(), {
    closing_schedule: {
      weekly: {
        ...form.closing_schedule.weekly,
        current_week: useWeekOverride
          ? buildCurrentWeekOverride(
              weekMonday,
              toLocalIso(addDays(previewMonday, overrideEndDay - 1)),
              overrideTime
            )
          : null,
      },
    },
  });

  return (
    <Modal open={open} title="Configurações do projeto" onClose={() => !saving && onClose()} wide>
      {loading ? (
        <p className="muted">Carregando...</p>
      ) : (
        <form onSubmit={handleSubmit} className="finance-settings-form">
          {error && <p className="error">{error}</p>}

          <section className="finance-settings-section card">
            <h3>Fechamento semanal</h3>
            <p className="hint">
              Defina o dia e horário padrão. Semanas com feriado podem ter exceção só para a semana atual.
            </p>
            <div className="form-grid">
              <label>
                Dia padrão de fechamento
                <select
                  value={form.closing_schedule.weekly.default_weekday}
                  onChange={(e) => setWeekly({ default_weekday: Number(e.target.value) })}
                >
                  {WEEKDAY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Horário padrão
                <input
                  type="time"
                  value={form.closing_schedule.weekly.default_time}
                  onChange={(e) => setWeekly({ default_time: e.target.value })}
                />
              </label>
              <label className="full">
                Modo de fechamento semanal
                <select
                  value={form.closing_schedule.weekly.mode}
                  onChange={(e) => setWeekly({ mode: e.target.value })}
                >
                  {CLOSING_MODE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="checkbox-label full finance-settings-override-toggle">
              <input
                type="checkbox"
                checked={useWeekOverride}
                onChange={(e) => setUseWeekOverride(e.target.checked)}
              />
              Ajustar fechamento da <strong>semana atual</strong> (ex.: feriados na quinta/sexta)
            </label>

            {useWeekOverride && (
              <div className="form-grid finance-settings-override">
                <label>
                  Último dia operacional desta semana
                  <select value={overrideEndDay} onChange={(e) => setOverrideEndDay(Number(e.target.value))}>
                    {WEEKDAY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Horário desta semana
                  <input type="time" value={overrideTime} onChange={(e) => setOverrideTime(e.target.value)} />
                </label>
              </div>
            )}

            <p className="hint-inline">
              Semana atual: <strong>{previewRange.start}</strong> a <strong>{previewRange.end}</strong>
            </p>
          </section>

          <section className="finance-settings-section card">
            <h3>Fechamento diário</h3>
            <p className="hint">
              Opcional. Fechamento automático só o admin reabre. Manual segue o privilégio de fechamento.
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.closing_schedule.daily.enabled}
                onChange={(e) => setDaily({ enabled: e.target.checked })}
              />
              Ativar fechamento diário
            </label>
            {form.closing_schedule.daily.enabled && (
              <div className="form-grid" style={{ marginTop: "0.75rem" }}>
                <label>
                  Horário
                  <input
                    type="time"
                    value={form.closing_schedule.daily.time}
                    onChange={(e) => setDaily({ time: e.target.value })}
                  />
                </label>
                <label>
                  Modo
                  <select
                    value={form.closing_schedule.daily.mode}
                    onChange={(e) => setDaily({ mode: e.target.value })}
                  >
                    {CLOSING_MODE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </section>

          <section className="finance-settings-section card">
            <div className="toolbar toolbar-spread">
              <div>
                <h3>Regras de bônus</h3>
                <p className="hint" style={{ margin: 0 }}>
                  Configuração das metas — o cálculo automático será aplicado em etapa posterior.
                </p>
              </div>
              <button type="button" className="btn btn-sm btn-primary" onClick={addBonusRule}>
                + Regra
              </button>
            </div>

            {form.bonus_rules.length === 0 && (
              <p className="muted">Nenhuma regra cadastrada.</p>
            )}

            {form.bonus_rules.map((rule) => (
              <div key={rule.id} className="bonus-rule-card">
                <div className="bonus-rule-card-head">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) => updateBonusRule(rule.id, { enabled: e.target.checked })}
                    />
                    Ativa
                  </label>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => removeBonusRule(rule.id)}
                  >
                    Excluir
                  </button>
                </div>
                <div className="form-grid">
                  <label>
                    Nome
                    <input
                      value={rule.name}
                      onChange={(e) => updateBonusRule(rule.id, { name: e.target.value })}
                      placeholder="Ex.: Bônus 20 mil"
                    />
                  </label>
                  <label>
                    Tipo
                    <select
                      value={rule.rule_type}
                      onChange={(e) => updateBonusRule(rule.id, { rule_type: e.target.value })}
                    >
                      {BONUS_RULE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {rule.rule_type !== "sale_milestone" && (
                    <label>
                      Período
                      <select
                        value={rule.period}
                        onChange={(e) => updateBonusRule(rule.id, { period: e.target.value })}
                      >
                        {BONUS_PERIOD_OPTIONS.filter((p) =>
                          rule.rule_type === "general_billing" ? p.value !== "sale" : true
                        ).map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    Meta (R$)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={rule.threshold_amount}
                      onChange={(e) =>
                        updateBonusRule(rule.id, { threshold_amount: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Bônus
                    <select
                      value={rule.reward_type}
                      onChange={(e) => updateBonusRule(rule.id, { reward_type: e.target.value })}
                    >
                      {REWARD_TYPE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Valor do bônus
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={rule.reward_value}
                      onChange={(e) => updateBonusRule(rule.id, { reward_value: Number(e.target.value) })}
                    />
                  </label>
                  <label className="full">
                    Descrição
                    <input
                      value={rule.description || ""}
                      onChange={(e) => updateBonusRule(rule.id, { description: e.target.value })}
                    />
                  </label>
                </div>
                <p className="hint-inline">
                  {BONUS_RULE_TYPES.find((t) => t.value === rule.rule_type)?.hint}
                </p>
                {(rule.rule_type === "user_threshold" || rule.rule_type === "general_billing") && (
                  <div className="bonus-rule-participants">
                    <strong>Participantes</strong>
                    <p className="hint-inline">Vazio = todos os membros do projeto.</p>
                    <div className="bonus-rule-participant-list">
                      {members.map((m) => (
                        <label key={m.user_id} className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={(rule.participant_ids || []).includes(m.user_id)}
                            onChange={() => toggleParticipant(rule.id, m.user_id)}
                          />
                          {m.user_name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </section>

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" disabled={saving} onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Salvando..." : "Salvar configurações"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
