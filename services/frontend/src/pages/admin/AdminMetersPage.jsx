import { useEffect, useMemo, useState } from "react";
import { createMeter, deleteMeter, getEnterprises, getLines, getMeters, getSites, updateMeter } from "../../api";
import { DataTable, FieldError, FieldLabel, Toasts, styles } from "../../ui.jsx";
import { formatDateTime } from "../../utils/datetime.js";

/** Узгоджено з операторською сторінкою «Лічильники» та типовими значеннями в БД */
const ROLE_LABELS = {
  submeter: "Підлічильник",
  workshop_zone: "Зона цеху",
  equipment: "Обладнання"
};

const ROLE_OPTIONS = [
  { value: "submeter", label: "Підлічильник" },
  { value: "workshop_zone", label: "Зона цеху" },
  { value: "equipment", label: "Обладнання" }
];

const METER_TYPE_OPTIONS = [
  { value: "electricity", label: "Електроенергія" },
  { value: "gas", label: "Газ" },
  { value: "water", label: "Вода" },
  { value: "heat", label: "Тепло" }
];

const STATUS_OPTIONS = [
  { value: "active", label: "Активний" },
  { value: "inactive", label: "Неактивний" },
  { value: "maintenance", label: "Обслуговування" }
];

function fmtDt(iso) {
  return formatDateTime(iso);
}

const DEFAULT_ZONE_TEMPLATES = [
  { value: "welding_zone", label: "Зона зварювання", meter_role: "workshop_zone" },
  { value: "ventilation", label: "Вентиляція", meter_role: "equipment" },
  { value: "compressor", label: "Компресорна", meter_role: "equipment" },
  { value: "pumps", label: "Насоси", meter_role: "equipment" }
];
const ZONE_TEMPLATES_LS_KEY = "meter_zone_templates_v1";

export default function AdminMetersPage() {
  const [zoneTemplates, setZoneTemplates] = useState(DEFAULT_ZONE_TEMPLATES);
  const [templateForm, setTemplateForm] = useState({
    label: "",
    meter_role: "workshop_zone",
  });
  const [meters, setMeters] = useState([]);
  const [sites, setSites] = useState([]);
  const [lines, setLines] = useState([]);
  const [enterprises, setEnterprises] = useState([]);
  const [form, setForm] = useState({
    site_id: "",
    line_id: "",
    zone_template: DEFAULT_ZONE_TEMPLATES[0].value,
    zone_name: "",
    meter_role: "workshop_zone",
    serial_number: "",
    meter_type: "electricity",
    status: "active"
  });
  const [editingId, setEditingId] = useState(null);
  const [errors, setErrors] = useState({});
  const [toasts, setToasts] = useState([]);
  const siteNameById = Object.fromEntries(sites.map((s) => [s.id, s.name]));
  const lineNameById = Object.fromEntries(lines.map((l) => [l.id, `${l.code} - ${l.name}`]));

  const selectedSite = sites.find((s) => String(s.id) === String(form.site_id));
  const compatibleLines = selectedSite
    ? lines.filter((l) => String(l.id) === String(selectedSite.line_id))
    : [];

  const pushToast = (text, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2500);
  };

  const load = async () => {
    const [m, s, ls, ent] = await Promise.all([getMeters(), getSites(), getLines(), getEnterprises()]);
    setMeters(m);
    setSites(s);
    setLines(ls);
    setEnterprises(ent);
    if (!form.site_id && s.length)
      setForm((prev) => ({ ...prev, site_id: String(s[0].id), line_id: s[0].line_id ? String(s[0].line_id) : "" }));
  };

  const enterpriseNameBySiteId = useMemo(() => {
    const entMap = Object.fromEntries(enterprises.map((e) => [e.id, e.name]));
    return Object.fromEntries(sites.map((site) => [site.id, entMap[site.enterprise_id] ?? "—"]));
  }, [sites, enterprises]);

  const metersSorted = useMemo(() => [...meters].sort((a, b) => b.id - a.id), [meters]);

  const typeLabel = (v) => METER_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v ?? "—";
  const statusLabel = (v) => STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v ?? "—";

  useEffect(() => { load(); }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ZONE_TEMPLATES_LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        const cleaned = parsed
          .filter((t) => t && typeof t.label === "string")
          .map((t) => ({
            value: t.value || `tpl_${Date.now()}`,
            label: t.label,
            meter_role: t.meter_role === "equipment" ? "equipment" : "workshop_zone",
          }));
        setZoneTemplates(cleaned.length ? cleaned : DEFAULT_ZONE_TEMPLATES);
      }
    } catch {
      // ignore localStorage parse errors
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(ZONE_TEMPLATES_LS_KEY, JSON.stringify(zoneTemplates));
  }, [zoneTemplates]);

  useEffect(() => {
    if (!selectedSite) return;
    const t = zoneTemplates.find((x) => x.value === form.zone_template) || zoneTemplates[0];
    const nextLineId = selectedSite.line_id ? String(selectedSite.line_id) : "";
    setForm((prev) => ({
      ...prev,
      line_id: nextLineId,
      zone_name: `${selectedSite.name} - ${t.label}`,
      meter_role: t.meter_role || "workshop_zone",
    }));
  }, [selectedSite, form.zone_template, zoneTemplates]);

  const resetForm = () => {
    setEditingId(null);
    setErrors({});
    setForm((prev) => ({
      ...prev,
      zone_template: zoneTemplates[0]?.value || DEFAULT_ZONE_TEMPLATES[0].value,
      serial_number: "",
      zone_name: "",
      meter_role: "workshop_zone",
      meter_type: "electricity",
      status: "active"
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const nextErrors = {};
    if (!form.site_id) nextErrors.site_id = "Обери об'єкт.";
    if (!form.line_id) nextErrors.line_id = "Для об'єкта не задано лінію.";
    if (!form.zone_name.trim()) nextErrors.zone_name = "Вкажи назву зони.";
    if (!form.serial_number.trim()) nextErrors.serial_number = "Вкажи серійний номер.";
    if (!form.status.trim()) nextErrors.status = "Вкажи статус.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    try {
      const payload = {
        site_id: Number(form.site_id),
        line_id: Number(form.line_id),
        zone_name: form.zone_name.trim(),
        meter_role: form.meter_role,
        serial_number: form.serial_number.trim(),
        meter_type: (form.meter_type || "electricity").trim(),
        status: (form.status || "active").trim(),
        last_seen_at: null
      };
      if (editingId) {
        await updateMeter(editingId, payload);
        pushToast("Лічильник оновлено.");
      } else {
        await createMeter(payload);
        pushToast("Лічильник створено.");
      }
      resetForm();
      await load();
    } catch (err) {
      pushToast(err?.response?.data?.detail || "Помилка збереження лічильника.", "error");
    }
  };

  const beginEdit = (meter) => {
    const rawStatus = String(meter.status || "active").toLowerCase();
    const statusOk = STATUS_OPTIONS.some((o) => o.value === rawStatus) ? rawStatus : "active";
    setEditingId(meter.id);
    setForm({
      site_id: String(meter.site_id),
      line_id: String(meter.line_id),
      zone_template: zoneTemplates.find((t) => meter.zone_name?.endsWith(t.label))?.value || (zoneTemplates[0]?.value ?? DEFAULT_ZONE_TEMPLATES[0].value),
      zone_name: meter.zone_name || "",
      meter_role: meter.meter_role || "submeter",
      serial_number: meter.serial_number || "",
      meter_type: meter.meter_type || "electricity",
      status: statusOk
    });
  };

  const remove = async (meterId) => {
    if (!window.confirm("Видалити лічильник?")) return;
    try {
      await deleteMeter(meterId);
      pushToast("Лічильник видалено.");
      await load();
    } catch (err) {
      pushToast(err?.response?.data?.detail || "Не вдалося видалити лічильник.", "error");
    }
  };

  const addTemplate = (e) => {
    e.preventDefault();
    if (!templateForm.label.trim()) {
      pushToast("Вкажи назву шаблону.", "error");
      return;
    }
    const normalizedLabel = templateForm.label.trim();
    if (zoneTemplates.some((t) => t.label.toLowerCase() === normalizedLabel.toLowerCase())) {
      pushToast("Шаблон з такою назвою вже існує.", "error");
      return;
    }
    const value = `tpl_${Date.now()}`;
    const next = {
      value,
      label: normalizedLabel,
      meter_role: templateForm.meter_role,
    };
    setZoneTemplates((prev) => [...prev, next]);
    setTemplateForm({ label: "", meter_role: "workshop_zone" });
    pushToast("Шаблон додано.");
  };

  const removeTemplate = (value) => {
    if (!window.confirm("Видалити шаблон зони?")) return;
    const next = zoneTemplates.filter((t) => t.value !== value);
    if (!next.length) {
      pushToast("Має залишитись хоча б один шаблон.", "error");
      return;
    }
    setZoneTemplates(next);
    setForm((prev) => ({
      ...prev,
      zone_template: next.some((t) => t.value === prev.zone_template) ? prev.zone_template : next[0].value
    }));
  };

  return (
    <div style={styles.page}>
      <Toasts items={toasts} />

      <div style={styles.grid2}>
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Шаблони зон</h3>
          <form onSubmit={addTemplate}>
            <p style={{ margin: "0 0 12px 0" }}>
              <FieldLabel text="Назва шаблону" />
              <input
                style={styles.input}
                value={templateForm.label}
                onChange={(e) => setTemplateForm({ ...templateForm, label: e.target.value })}
                placeholder="Напр. Насоси"
              />
            </p>
            <p style={{ margin: "0 0 12px 0" }}>
              <FieldLabel text="Роль лічильника для шаблону" />
              <select
                style={styles.select}
                value={templateForm.meter_role}
                onChange={(e) => setTemplateForm({ ...templateForm, meter_role: e.target.value })}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </p>
            <div style={styles.toolbar}>
              <button style={styles.button} type="submit">
                Додати шаблон
              </button>
            </div>
          </form>
          <DataTable
            columns={["Шаблон", "Роль", "Дії"]}
            tableStyle={{ minWidth: 360 }}
            rows={zoneTemplates.map((t) => [
              t.label,
              ROLE_LABELS[t.meter_role] ?? t.meter_role ?? "—",
              <button key={t.value} type="button" style={styles.buttonSecondary} onClick={() => removeTemplate(t.value)}>
                Видалити
              </button>
            ])}
          />
        </div>

        <div style={styles.card}>
          <h3 style={styles.cardTitle}>{editingId ? `Редагувати лічильник #${editingId}` : "Створити лічильник"}</h3>
          <form onSubmit={submit}>
            <p style={{ margin: "0 0 12px 0" }}>
              <FieldLabel text="Об'єкт (site)" />
              <select
                style={{ ...styles.select, ...(errors.site_id ? styles.inputError : {}) }}
                value={form.site_id}
                onChange={(e) => setForm({ ...form, site_id: e.target.value })}
              >
                {sites.length === 0 ? <option value="">— Немає об'єктів —</option> : null}
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} — {s.name}
                  </option>
                ))}
              </select>
              <FieldError text={errors.site_id} />
            </p>
            <p style={{ margin: "0 0 12px 0" }}>
              <FieldLabel text="Лінія (з об'єкта)" />
              <select
                style={{ ...styles.select, ...(errors.line_id ? styles.inputError : {}) }}
                value={form.line_id}
                onChange={(e) => setForm({ ...form, line_id: e.target.value })}
              >
                <option value="">Оберіть лінію</option>
                {compatibleLines.map((ln) => (
                  <option key={ln.id} value={ln.id}>
                    {ln.code} — {ln.name}
                  </option>
                ))}
              </select>
              <FieldError text={errors.line_id} />
            </p>
            <p style={{ margin: "0 0 12px 0" }}>
              <FieldLabel text="Шаблон зони" />
              <select style={styles.select} value={form.zone_template} onChange={(e) => setForm({ ...form, zone_template: e.target.value })}>
                {zoneTemplates.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </p>
            <p style={{ margin: "0 0 12px 0" }}>
              <FieldLabel text="Назва зони (zone_name)" />
              <input
                style={{ ...styles.input, ...(errors.zone_name ? styles.inputError : {}) }}
                value={form.zone_name}
                readOnly
                placeholder="Формується з об'єкта та шаблону"
              />
              <FieldError text={errors.zone_name} />
            </p>
            <p style={{ margin: "0 0 12px 0" }}>
              <FieldLabel text="Роль лічильника" />
              <select style={styles.select} value={form.meter_role} onChange={(e) => setForm({ ...form, meter_role: e.target.value })}>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </p>
            <p style={{ margin: "0 0 12px 0" }}>
              <FieldLabel text="Серійний номер" />
              <input
                style={{ ...styles.input, ...(errors.serial_number ? styles.inputError : {}) }}
                value={form.serial_number}
                onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                placeholder="Унікальний серійний номер"
              />
              <FieldError text={errors.serial_number} />
            </p>
            <p style={{ margin: "0 0 12px 0" }}>
              <FieldLabel text="Тип лічильника" />
              <select style={styles.select} value={form.meter_type} onChange={(e) => setForm({ ...form, meter_type: e.target.value })}>
                {METER_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </p>
            <p style={{ margin: "0 0 12px 0" }}>
              <FieldLabel text="Статус" />
              <select style={{ ...styles.select, ...(errors.status ? styles.inputError : {}) }} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <FieldError text={errors.status} />
            </p>
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
      </div>

      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Лічильники</h3>
        <p style={{ ...styles.muted, marginTop: 0 }}>
          Усього: {meters.length}. Новіші записи зверху (за ID).
        </p>
        <DataTable
          columns={[
            "ID",
            "Підприємство",
            "Об'єкт",
            "Лінія",
            "Зона",
            "Роль",
            "Серійний номер",
            "Тип",
            "Статус",
            "Головний",
            "Створено",
            "Дії"
          ]}
          tableStyle={{ minWidth: 1240 }}
          rows={metersSorted.map((m) => [
            m.id,
            enterpriseNameBySiteId[m.site_id] ?? "—",
            siteNameById[m.site_id] ?? m.site_id,
            lineNameById[m.line_id] ?? m.line_id,
            m.zone_name ?? "—",
            ROLE_LABELS[m.meter_role] ?? m.meter_role ?? "—",
            m.serial_number,
            typeLabel(m.meter_type),
            statusLabel(m.status),
            m.is_main_meter ? "Так" : "Ні",
            fmtDt(m.created_at),
            <div key={m.id} style={styles.actionGroup}>
              <button type="button" style={styles.buttonSecondary} onClick={() => beginEdit(m)}>
                Редагувати
              </button>
              <button type="button" style={styles.buttonSecondary} onClick={() => remove(m.id)}>
                Видалити
              </button>
            </div>
          ])}
        />
      </div>
    </div>
  );
}
