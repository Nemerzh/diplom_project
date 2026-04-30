import { useEffect, useState } from "react";
import { createAlertRule, deleteAlertRule, getAlertRules, getMeters, getSites, updateAlertRule } from "../../api";
import { DataTable, FieldError, FieldLabel, Toasts, styles } from "../../ui.jsx";

export default function AdminAlertRulesPage() {
  const [rules, setRules] = useState([]);
  const [sites, setSites] = useState([]);
  const [meters, setMeters] = useState([]);
  const [form, setForm] = useState({ site_id: "", meter_id: "", rule_type: "threshold", threshold_kwh: 500, severity: "high", enabled: true });
  const [editingId, setEditingId] = useState(null);
  const [errors, setErrors] = useState({});
  const [toasts, setToasts] = useState([]);
  const siteNameById = Object.fromEntries(sites.map((s) => [s.id, s.name]));
  const meterNameById = Object.fromEntries(meters.map((m) => [m.id, m.serial_number]));

  const pushToast = (text, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2500);
  };

  const load = async () => {
    const [r, s, m] = await Promise.all([getAlertRules(), getSites(), getMeters()]);
    setRules(r);
    setSites(s);
    setMeters(m);
  };

  useEffect(() => { load(); }, []);

  const filteredMeters = form.site_id ? meters.filter((m) => String(m.site_id) === String(form.site_id)) : meters;
  const meterById = Object.fromEntries(meters.map((m) => [m.id, m]));

  useEffect(() => {
    if (!form.meter_id) return;
    const meter = meterById[Number(form.meter_id)];
    if (meter && String(form.site_id) !== String(meter.site_id)) {
      setForm((prev) => ({ ...prev, site_id: String(meter.site_id) }));
    }
  }, [form.meter_id, form.site_id, meterById]);

  const resetForm = () => {
    setEditingId(null);
    setErrors({});
    setForm({ site_id: "", meter_id: "", rule_type: "threshold", threshold_kwh: 500, severity: "high", enabled: true });
  };

  const submit = async (e) => {
    e.preventDefault();
    const nextErrors = {};
    if (!form.rule_type.trim()) nextErrors.rule_type = "Вкажи тип правила.";
    if (!form.severity.trim()) nextErrors.severity = "Вкажи критичність.";
    if (!form.threshold_kwh || Number(form.threshold_kwh) <= 0) nextErrors.threshold_kwh = "Поріг має бути > 0.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const payload = {
      site_id: form.site_id ? Number(form.site_id) : null,
      meter_id: form.meter_id ? Number(form.meter_id) : null,
      rule_type: form.rule_type.trim(),
      threshold_kwh: Number(form.threshold_kwh),
      severity: form.severity.trim(),
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
    setForm({
      site_id: rule.site_id ? String(rule.site_id) : "",
      meter_id: rule.meter_id ? String(rule.meter_id) : "",
      rule_type: rule.rule_type || "threshold",
      threshold_kwh: rule.threshold_kwh ?? 500,
      severity: rule.severity || "high",
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

  return (
    <div style={styles.grid2}>
      <Toasts items={toasts} />
      <div style={styles.card}>
        <h3>{editingId ? `Редагувати правило #${editingId}` : "Створити правило сповіщення"}</h3>
        <form onSubmit={submit}>
          <p>
            <FieldLabel text="Об'єкт (Site) для правила" />
            <select style={styles.input} value={form.site_id} onChange={(e) => setForm({ ...form, site_id: e.target.value, meter_id: "" })}>
              <option value="">Всі об'єкти</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </p>
          <p>
            <FieldLabel text="Лічильник (опційно)" />
            <select style={styles.input} value={form.meter_id} onChange={(e) => setForm({ ...form, meter_id: e.target.value })}>
              <option value="">Всі лічильники</option>
              {filteredMeters.map((m) => <option key={m.id} value={m.id}>{m.serial_number}</option>)}
            </select>
          </p>
          <p>
            <FieldLabel text="Тип правила" />
            <input style={{ ...styles.input, ...(errors.rule_type ? styles.inputError : {}) }} value={form.rule_type} onChange={(e) => setForm({ ...form, rule_type: e.target.value })} placeholder="Тип правила" />
            <FieldError text={errors.rule_type} />
          </p>
          <p>
            <FieldLabel text="Поріг, кВт·год" />
            <input style={{ ...styles.input, ...(errors.threshold_kwh ? styles.inputError : {}) }} value={form.threshold_kwh} onChange={(e) => setForm({ ...form, threshold_kwh: e.target.value })} placeholder="Поріг, кВт·год" />
            <FieldError text={errors.threshold_kwh} />
          </p>
          <p>
            <FieldLabel text="Рівень критичності" />
            <input style={{ ...styles.input, ...(errors.severity ? styles.inputError : {}) }} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} placeholder="Критичність" />
            <FieldError text={errors.severity} />
          </p>
          <p>
            <FieldLabel text="Стан правила" />
            <label style={styles.muted}><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Активне правило</label>
          </p>
          <div style={styles.toolbar}>
            <button style={styles.button} type="submit">{editingId ? "Оновити" : "Створити"}</button>
            {editingId ? <button style={styles.buttonSecondary} type="button" onClick={resetForm}>Скасувати</button> : null}
          </div>
        </form>
      </div>
      <div style={styles.card}>
        <h3>Правила сповіщень</h3>
        <DataTable
          columns={["Об'єкт", "Лічильник", "Тип", "Поріг", "Критичність", "Активне", "Дії"]}
          rows={rules.map((r) => [
            r.site_id ? (siteNameById[r.site_id] ?? r.site_id) : "-",
            r.meter_id ? (meterNameById[r.meter_id] ?? r.meter_id) : "-",
            r.rule_type,
            r.threshold_kwh,
            r.severity,
            r.enabled ? "так" : "ні",
            <div key={r.id} style={styles.actionGroup}>
              <button style={styles.buttonSecondary} onClick={() => beginEdit(r)}>Редагувати</button>
              <button style={styles.buttonSecondary} onClick={() => remove(r.id)}>Видалити</button>
            </div>
          ])}
        />
      </div>
    </div>
  );
}
