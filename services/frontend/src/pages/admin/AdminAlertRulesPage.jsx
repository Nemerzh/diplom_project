import { useEffect, useMemo, useState } from "react";
import { createAlertRule, deleteAlertRule, getAlertRules, getEnterprises, getMeters, getSites, updateAlertRule } from "../../api";
import { DataTable, FieldError, FieldLabel, Toasts, styles } from "../../ui.jsx";

const SEVERITY_OPTIONS = [
  { value: "low", label: "Низька" },
  { value: "medium", label: "Середня" },
  { value: "high", label: "Висока" },
  { value: "critical", label: "Критична" },
  { value: "warning", label: "Попередження" }
];

const WINDOW_OPTIONS = [7, 14, 30, 60, 90];

function scopeFromRule(rule) {
  if (rule.meter_id) return "meter";
  if (rule.site_id) return "site";
  return "global";
}

export default function AdminAlertRulesPage() {
  const [rules, setRules] = useState([]);
  const [sites, setSites] = useState([]);
  const [meters, setMeters] = useState([]);
  const [enterprises, setEnterprises] = useState([]);
  const [scope, setScope] = useState("site");
  const [form, setForm] = useState({
    site_id: "",
    meter_id: "",
    threshold_kwh: 500,
    severity: "high",
    window_days: 30,
    enabled: true
  });
  const [editingId, setEditingId] = useState(null);
  const [errors, setErrors] = useState({});
  const [toasts, setToasts] = useState([]);
  const [enterpriseFilter, setEnterpriseFilter] = useState("");

  const siteNameById = Object.fromEntries(sites.map((s) => [s.id, s.name]));
  const meterNameById = Object.fromEntries(meters.map((m) => [m.id, m.serial_number]));
  const enterpriseById = Object.fromEntries(enterprises.map((e) => [e.id, e]));

  const pushToast = (text, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2500);
  };

  const load = async () => {
    const [r, s, m, e] = await Promise.all([getAlertRules(), getSites(), getMeters(), getEnterprises()]);
    setRules(r);
    setSites(s);
    setMeters(m);
    setEnterprises(e);
  };

  useEffect(() => {
    load();
  }, []);

  const sitesFiltered = useMemo(() => {
    if (!enterpriseFilter) return sites;
    return sites.filter((x) => String(x.enterprise_id) === enterpriseFilter);
  }, [sites, enterpriseFilter]);

  const metersScoped = useMemo(() => {
    if (!enterpriseFilter) return meters;
    const sids = new Set(sitesFiltered.map((s) => s.id));
    return meters.filter((m) => sids.has(m.site_id));
  }, [meters, enterpriseFilter, sitesFiltered]);

  const filteredMeters = form.site_id ? metersScoped.filter((m) => String(m.site_id) === String(form.site_id)) : metersScoped;
  const meterById = Object.fromEntries(meters.map((m) => [m.id, m]));

  useEffect(() => {
    if (scope !== "meter" || !form.meter_id) return;
    const meter = meterById[Number(form.meter_id)];
    if (meter) setForm((prev) => ({ ...prev, site_id: String(meter.site_id) }));
  }, [scope, form.meter_id, meterById]);

  const previewText = useMemo(() => {
    const wd = Number(form.window_days) || 30;
    const thr = Number(form.threshold_kwh) || 0;
    let area = "усієї системи (усі об'єкти)";
    if (scope === "site" && form.site_id) {
      area = `об'єкта «${siteNameById[Number(form.site_id)] ?? form.site_id}»`;
    } else if (scope === "meter" && form.meter_id) {
      area = `лічильника ${meterNameById[Number(form.meter_id)] ?? form.meter_id}`;
    } else if (scope === "site") area = "об'єкта (оберіть об'єкт)";
    else if (scope === "meter") area = "лічильника (оберіть лічильник)";
    return `Якщо сума денних показів за ${wd} дн. для ${area} перевищить ${thr} кВт·год, буде створено сповіщення (якщо ще немає активного для цього правила).`;
  }, [scope, form, siteNameById, meterNameById]);

  const resetForm = () => {
    setEditingId(null);
    setErrors({});
    setScope("site");
    setForm({
      site_id: "",
      meter_id: "",
      threshold_kwh: 500,
      severity: "high",
      window_days: 30,
      enabled: true
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    const nextErrors = {};
    if (scope === "site" && !form.site_id) nextErrors.scope = "Обери об'єкт або зміни масштаб.";
    if (scope === "meter") {
      if (!form.meter_id) nextErrors.meter_id = "Обери лічильник.";
      if (!form.site_id && form.meter_id) {
        const meter = meterById[Number(form.meter_id)];
        if (!meter) nextErrors.meter_id = "Невідомий лічильник.";
      }
    }
    if (!form.threshold_kwh || Number(form.threshold_kwh) <= 0) nextErrors.threshold_kwh = "Поріг має бути > 0.";
    const wd = Number(form.window_days);
    if (!wd || wd < 1 || wd > 366) nextErrors.window_days = "Кількість днів: 1–366.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    let site_id = null;
    let meter_id = null;
    if (scope === "site") site_id = Number(form.site_id);
    else if (scope === "meter") {
      meter_id = Number(form.meter_id);
      const m = meterById[meter_id];
      site_id = m ? m.site_id : null;
    }

    const payload = {
      site_id,
      meter_id,
      rule_type: "threshold",
      threshold_kwh: Number(form.threshold_kwh),
      severity: form.severity,
      window_days: wd,
      enabled: Boolean(form.enabled)
    };

    try {
      if (editingId) {
        await updateAlertRule(editingId, payload);
        pushToast("Правило оновлено.");
      } else {
        await createAlertRule(payload);
        pushToast("Правило створено.");
      }
      resetForm();
      await load();
    } catch (err) {
      pushToast(err?.response?.data?.detail || "Не вдалося зберегти правило.", "error");
    }
  };

  const beginEdit = (rule) => {
    setEditingId(rule.id);
    setScope(scopeFromRule(rule));
    setForm({
      site_id: rule.site_id ? String(rule.site_id) : "",
      meter_id: rule.meter_id ? String(rule.meter_id) : "",
      threshold_kwh: rule.threshold_kwh ?? 500,
      severity: rule.severity || "high",
      window_days: rule.window_days ?? 30,
      enabled: Boolean(rule.enabled)
    });
  };

  const remove = async (ruleId) => {
    if (!window.confirm("Видалити правило?")) return;
    try {
      await deleteAlertRule(ruleId);
      pushToast("Правило видалено.");
      await load();
    } catch (err) {
      pushToast(err?.response?.data?.detail || "Не вдалося видалити правило.", "error");
    }
  };

  const ruleConditionSummary = (r) =>
    `Сума за ${r.window_days ?? 30} дн. > ${Number(r.threshold_kwh).toLocaleString("uk-UA")} кВт·год`;

  const ruleScopeSummary = (r) => {
    if (r.meter_id) return `Лічильник: ${meterNameById[r.meter_id] ?? r.meter_id}`;
    if (r.site_id) return `Об'єкт: ${siteNameById[r.site_id] ?? r.site_id}`;
    return "Уся система";
  };

  const filteredRules = useMemo(() => {
    if (!enterpriseFilter) return rules;
    const siteIds = new Set(sitesFiltered.map((s) => s.id));
    return rules.filter((r) => {
      if (r.site_id && siteIds.has(r.site_id)) return true;
      if (r.meter_id) {
        const m = meterById[r.meter_id];
        return m && siteIds.has(m.site_id);
      }
      return true;
    });
  }, [rules, enterpriseFilter, sitesFiltered, meterById]);

  return (
    <div style={styles.grid2}>
      <Toasts items={toasts} />
      <div style={styles.card}>
        <h3 style={{ marginTop: 0 }}>{editingId ? `Редагувати правило #${editingId}` : "Нове правило сповіщення"}</h3>
        <p style={styles.muted}>
          Тип умови: лише <strong>перевищення суми споживання</strong> по денних агрегатах (<code>threshold</code>). Інші типи
          можна додати пізніше в логіці перевірки.
        </p>

        <form onSubmit={submit}>
          <p>
            <FieldLabel text="Масштаб правила" />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <label style={styles.muted}>
                <input
                  type="radio"
                  name="scope"
                  checked={scope === "global"}
                  onChange={() => {
                    setScope("global");
                    setForm((f) => ({ ...f, site_id: "", meter_id: "" }));
                  }}
                />{" "}
                Уся система
              </label>
              <label style={styles.muted}>
                <input
                  type="radio"
                  name="scope"
                  checked={scope === "site"}
                  onChange={() => {
                    setScope("site");
                    setForm((f) => ({ ...f, meter_id: "" }));
                  }}
                />{" "}
                Об'єкт
              </label>
              <label style={styles.muted}>
                <input
                  type="radio"
                  name="scope"
                  checked={scope === "meter"}
                  onChange={() => setScope("meter")}
                />{" "}
                Лічильник
              </label>
            </div>
            {scope === "global" ? (
              <p style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 8, padding: 10, fontSize: 13 }}>
                Глобальне правило порівнює суму споживання <strong>по всіх об'єктах разом</strong>. Використовуй обережно.
              </p>
            ) : null}
            <FieldError text={errors.scope} />
          </p>

          {scope !== "global" ? (
            <p>
              <FieldLabel text="Об'єкт" />
              <select
                style={{ ...styles.input, ...(errors.scope ? styles.inputError : {}) }}
                value={form.site_id}
                onChange={(e) => setForm({ ...form, site_id: e.target.value, meter_id: scope === "meter" ? form.meter_id : "" })}
                disabled={scope === "meter"}
              >
                <option value="">— Обери об'єкт —</option>
                {sitesFiltered.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({enterpriseById[s.enterprise_id]?.name ?? s.enterprise_id})
                  </option>
                ))}
              </select>
            </p>
          ) : null}

          {scope === "meter" ? (
            <p>
              <FieldLabel text="Лічильник" />
              <select
                style={{ ...styles.input, ...(errors.meter_id ? styles.inputError : {}) }}
                value={form.meter_id}
                onChange={(e) => setForm({ ...form, meter_id: e.target.value })}
              >
                <option value="">— Обери лічильник —</option>
                {(form.site_id ? filteredMeters : metersScoped).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.serial_number} · {m.zone_name}
                  </option>
                ))}
              </select>
              <FieldError text={errors.meter_id} />
            </p>
          ) : null}

          <p>
            <FieldLabel text="Період суми, днів" />
            <select
              style={{ ...styles.input, ...(errors.window_days ? styles.inputError : {}) }}
              value={String(form.window_days)}
              onChange={(e) => setForm({ ...form, window_days: Number(e.target.value) })}
            >
              {WINDOW_OPTIONS.map((d) => (
                <option key={d} value={String(d)}>
                  {d} днів
                </option>
              ))}
            </select>
            <FieldError text={errors.window_days} />
          </p>

          <p>
            <FieldLabel text="Поріг суми, кВт·год" />
            <input
              style={{ ...styles.input, ...(errors.threshold_kwh ? styles.inputError : {}) }}
              type="number"
              min={0.01}
              step="any"
              value={form.threshold_kwh}
              onChange={(e) => setForm({ ...form, threshold_kwh: e.target.value })}
            />
            <FieldError text={errors.threshold_kwh} />
          </p>

          <p>
            <FieldLabel text="Критичність" />
            <select style={styles.input} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
              {SEVERITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </p>

          <p>
            <FieldLabel text="Стан" />
            <label style={styles.muted}>
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Активне
            </label>
          </p>

          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: 12,
              background: "#f8fafc",
              fontSize: 13,
              marginBottom: 12
            }}
          >
            <strong>Прев’ю:</strong> {previewText}
          </div>

          <div style={styles.toolbar}>
            <button style={styles.button} type="submit">
              {editingId ? "Оновити" : "Створити"}
            </button>
            {editingId ? (
              <button style={styles.buttonSecondary} type="button" onClick={resetForm}>
                Скасувати
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <div style={styles.card}>
        <h3 style={{ marginTop: 0 }}>Правила</h3>
        <div style={{ ...styles.toolbar, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
          <div style={{ minWidth: 220 }}>
            <FieldLabel text="Фільтр: підприємство" />
            <select style={styles.input} value={enterpriseFilter} onChange={(e) => setEnterpriseFilter(e.target.value)}>
              <option value="">Усі</option>
              {enterprises.map((e) => (
                <option key={e.id} value={String(e.id)}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DataTable
          columns={["Масштаб", "Умова", "Критичність", "Активне", "Дії"]}
          rows={filteredRules.map((r) => [
            ruleScopeSummary(r),
            ruleConditionSummary(r),
            SEVERITY_OPTIONS.find((x) => x.value === r.severity)?.label ?? r.severity,
            r.enabled ? "так" : "ні",
            <div key={r.id} style={styles.actionGroup}>
              <button type="button" style={styles.buttonSecondary} onClick={() => beginEdit(r)}>
                Редагувати
              </button>
              <button type="button" style={styles.buttonSecondary} onClick={() => remove(r.id)}>
                Видалити
              </button>
            </div>
          ])}
        />
      </div>
    </div>
  );
}
