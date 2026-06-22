import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import Modal from "./Modal";
import Switch from "./Switch";
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
import { getProjectSectorsFromRegistry } from "../lib/projectSectors";
import { useSectors } from "../context/SectorsContext";
import { useAuth } from "../context/AuthContext";

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

export default function ProjectFinanceSettingsModal({
  open,
  onClose,
  projectId,
  periodStart,
  periodEnd,
  onSaved,
  onProjectUpdated,
}) {
  const { isAdmin } = useAuth();
  const { sectors, optionalSectors } = useSectors();
  const [form, setForm] = useState(emptyForm);
  const [projectName, setProjectName] = useState("");
  const [originalName, setOriginalName] = useState("");
  const [sectorState, setSectorState] = useState({});
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
    Promise.all([
      api.get(`/api/projects/${projectId}/finance-config`),
      api.get(`/api/projects/${projectId}`),
    ])
      .then(([configRes, projectRes]) => {
        const data = configRes.data;
        const proj = projectRes.data;
        const loadedName = proj.name || "";
        setProjectName(loadedName);
        setOriginalName(loadedName);
        setSectorState(getProjectSectorsFromRegistry(proj.settings, sectors));
        setForm({
          closing_schedule: data.closing_schedule,
          bonus_rules: (data.bonus_rules || []).map((r) => ({
            ...r,
            expires_at: r.expires_at || null,
            notify_on_automation: Boolean(r.notify_on_automation),
            notify_message: r.notify_message || "",
          })),
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
  }, [open, projectId, weekMonday, sectors]);

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

  const toggleSector = (sectorId, enabled) => {
    setSectorState((s) => ({ ...s, [sectorId]: enabled }));
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
      if (
        isAdmin &&
        projectName.trim() &&
        projectName.trim().toUpperCase() !== originalName.toUpperCase()
      ) {
        await api.patch(`/api/projects/${projectId}`, { name: projectName.trim() });
      }

      if (isAdmin) {
        const sectorPayload = optionalSectors.map((s) => ({
          sector_id: s.id,
          enabled: Boolean(sectorState[s.id]),
        }));
        await api.patch(`/api/gestao/projects/${projectId}/sectors`, {
          sectors: sectorPayload,
        });
      }

      const { data } = await api.patch(`/api/projects/${projectId}/finance-config`, {
        closing_schedule: {
          weekly,
          daily: form.closing_schedule.daily,
        },
        bonus_rules: form.bonus_rules.map((r) => ({
          ...r,
          expires_at: r.expires_at || null,
        })),
      });
      onSaved?.(data);
      onProjectUpdated?.();
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
        <form onSubmit={handleSubmit} className="finance-settings-form project-settings-form">
          {error && <p className="error">{error}</p>}

          {isAdmin && (
            <section className="finance-settings-section card project-settings-section">
              <h3>Identificação</h3>
              <label className="full">
                Nome do projeto
                <input
                  required
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Ex.: AGENCIA"
                />
              </label>
            </section>
          )}

          {isAdmin && (
            <section className="finance-settings-section card project-settings-section">
              <h3>Setores deste projeto</h3>
              <p className="hint">
                Financeiro é obrigatório em todo projeto. Demais setores são opcionais — configure cores e ordem
                em Gestão → Configurações.
              </p>
              <div className="project-settings-switches">
                {sectors.filter((s) => !s.adminOnly).map((s) => (
                  <Switch
                    key={s.id}
                    checked={s.alwaysOn ? true : Boolean(sectorState[s.id])}
                    disabled={s.alwaysOn || saving}
                    onChange={(v) => toggleSector(s.id, v)}
                    label={
                      <div className="sector-config-label">
                        <span
                          className="sector-dot sector-dot--inline"
                          style={{ backgroundColor: s.color }}
                        />
                        <div>
                          <strong>{s.label}</strong>
                          {s.alwaysOn && (
                            <p className="hint-inline">Obrigatório em todo projeto</p>
                          )}
                        </div>
                      </div>
                    }
                  />
                ))}
              </div>
            </section>
          )}

          <section className="finance-settings-section card project-settings-section">
            <h3>Fechamento semanal</h3>
            <p className="hint">
              Defina o dia e horário padrão. Semanas com feriado podem ter exceção só para a semana atual.
            </p>
            <div className="form-grid project-settings-grid">
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

            <Switch
              checked={useWeekOverride}
              onChange={setUseWeekOverride}
              label={
                <div>
                  <strong>Exceção na semana atual</strong>
                  <p className="hint-inline">Ajuste feriados na quinta/sexta desta semana</p>
                </div>
              }
            />

            {useWeekOverride && (
              <div className="form-grid project-settings-grid finance-settings-override">
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

          <section className="finance-settings-section card project-settings-section">
            <h3>Fechamento diário</h3>
            <p className="hint">
              Opcional. Fechamento automático só o admin reabre. Manual segue o privilégio de fechamento.
            </p>
            <Switch
              checked={form.closing_schedule.daily.enabled}
              onChange={(v) => setDaily({ enabled: v })}
              label={
                <div>
                  <strong>Ativar fechamento diário</strong>
                </div>
              }
            />
            {form.closing_schedule.daily.enabled && (
              <div className="form-grid project-settings-grid">
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

          <section className="finance-settings-section card project-settings-section">
            <div className="toolbar toolbar-spread">
              <div>
                <h3>Regras de bônus</h3>
                <p className="hint" style={{ margin: 0 }}>
                  Metas e recompensas. Use expiração e mensagem para a automação &quot;Meta atingida&quot;.
                </p>
              </div>
              <button type="button" className="btn btn-sm btn-primary" onClick={addBonusRule}>
                + Regra
              </button>
            </div>

            {form.bonus_rules.length === 0 && <p className="muted">Nenhuma regra cadastrada.</p>}

            {form.bonus_rules.map((rule) => (
              <div key={rule.id} className="bonus-rule-card">
                <div className="bonus-rule-card-head">
                  <Switch
                    checked={rule.enabled}
                    onChange={(v) => updateBonusRule(rule.id, { enabled: v })}
                    label={<strong>Regra ativa</strong>}
                  />
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => removeBonusRule(rule.id)}>
                    Excluir
                  </button>
                </div>
                <div className="form-grid project-settings-grid">
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
                  <label>
                    Expira em (opcional)
                    <input
                      type="date"
                      value={rule.expires_at || ""}
                      onChange={(e) =>
                        updateBonusRule(rule.id, { expires_at: e.target.value || null })
                      }
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

                <Switch
                  checked={Boolean(rule.notify_on_automation)}
                  onChange={(v) => updateBonusRule(rule.id, { notify_on_automation: v })}
                  label={
                    <div>
                      <strong>Mensagem na automação &quot;Meta atingida&quot;</strong>
                      <p className="hint-inline">Envia texto customizado quando a automação estiver ativa</p>
                    </div>
                  }
                />
                {rule.notify_on_automation && (
                  <label className="full">
                    Mensagem de notificação
                    <textarea
                      rows={3}
                      value={rule.notify_message || ""}
                      onChange={(e) => updateBonusRule(rule.id, { notify_message: e.target.value })}
                      placeholder="Ex.: Parabéns! A meta {{meta}} foi atingida por {{participante}}."
                    />
                  </label>
                )}

                {(rule.rule_type === "user_threshold" || rule.rule_type === "general_billing") && (
                  <div className="bonus-rule-participants">
                    <strong>Participantes</strong>
                    <p className="hint-inline">Vazio = todos os membros do projeto.</p>
                    <div className="bonus-rule-participant-list">
                      {members.map((m) => (
                        <Switch
                          key={m.user_id}
                          checked={(rule.participant_ids || []).includes(m.user_id)}
                          onChange={() => toggleParticipant(rule.id, m.user_id)}
                          label={m.user_name}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </section>

          <div className="form-actions project-settings-actions">
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
