import { useEffect, useState } from "react";
import { createReading, getMeters, getReadings, getSites, runValidation } from "../api";
import { DataTable, FieldError, FieldLabel, Toasts, styles } from "../ui.jsx";

export default function ReadingsPage() {
  const [rows, setRows] = useState([]);
  const [sites, setSites] = useState([]);
  const [meters, setMeters] = useState([]);
  const [form, setForm] = useState({ site_id: "", meter_id: "", value_kwh: "", source: "ui" });
  const [query, setQuery] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [errors, setErrors] = useState({});
  const [toasts, setToasts] = useState([]);

  const pushToast = (text, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2500);
  };

  const load = async () => {
    const [rowsData, metersData, sitesData] = await Promise.all([getReadings(200), getMeters(), getSites()]);
    setRows(rowsData);
    setMeters(metersData);
    setSites(sitesData);
    setForm((prev) => {
      const siteId = prev.site_id || (sitesData[0] ? String(sitesData[0].id) : "");
      const filtered = metersData.filter((m) => String(m.site_id) === String(siteId));
      const meterId = filtered.some((m) => String(m.id) === String(prev.meter_id))
        ? prev.meter_id
        : (filtered[0] ? String(filtered[0].id) : "");
      return { ...prev, site_id: siteId, meter_id: meterId };
    });
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => load(), 5000);
    return () => clearInterval(id);
  }, [autoRefresh, form.site_id]);

  const filteredMeters = meters.filter((m) => String(m.site_id) === String(form.site_id));
  const meterNameById = Object.fromEntries(meters.map((m) => [m.id, m.serial_number]));

  const submit = async (e) => {
    e.preventDefault();
    const nextErrors = {};
    if (!form.site_id) nextErrors.site_id = "Обери об'єкт.";
    if (!form.meter_id) nextErrors.meter_id = "Обери лічильник.";
    if (!form.value_kwh || Number(form.value_kwh) <= 0) nextErrors.value_kwh = "Вкажи додатнє значення кВт·год.";
    if (!form.source.trim()) nextErrors.source = "Вкажи джерело.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      await createReading({
        meter_id: Number(form.meter_id),
        value_kwh: Number(form.value_kwh),
        source: form.source.trim(),
        ts: new Date().toISOString()
      });
      setForm({ ...form, value_kwh: "" });
      await load();
      pushToast("Показ успішно збережено.", "success");
    } catch (err) {
      pushToast(err?.response?.data?.detail || "Не вдалося зберегти показ.", "error");
    }
  };

  return (
    <div style={styles.grid2}>
      <Toasts items={toasts} />
      <div style={styles.card}>
        <h3>Додати показ</h3>
        <form onSubmit={submit}>
          <p>
            <FieldLabel text="Об'єкт (Site)" />
            <select
              style={{ ...styles.input, ...(errors.site_id ? styles.inputError : {}) }}
              value={form.site_id}
              onChange={(e) => {
                const nextSiteId = e.target.value;
                const firstMeter = meters.find((m) => String(m.site_id) === String(nextSiteId));
                setForm({ ...form, site_id: nextSiteId, meter_id: firstMeter ? String(firstMeter.id) : "" });
              }}
              required
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.id} - {s.name}</option>
              ))}
            </select>
            <FieldError text={errors.site_id} />
          </p>
          <p>
            <FieldLabel text="Лічильник" />
            <select
              style={{ ...styles.input, ...(errors.meter_id ? styles.inputError : {}) }}
              value={form.meter_id}
              onChange={(e) => setForm({ ...form, meter_id: e.target.value })}
              required
            >
              {filteredMeters.map((m) => (
                <option key={m.id} value={m.id}>{m.id} - {m.serial_number}</option>
              ))}
            </select>
            <FieldError text={errors.meter_id} />
          </p>
          <p>
            <FieldLabel text="Значення, кВт·год" />
            <input style={{ ...styles.input, ...(errors.value_kwh ? styles.inputError : {}) }} value={form.value_kwh} onChange={(e) => setForm({ ...form, value_kwh: e.target.value })} placeholder="кВт·год" required />
            <FieldError text={errors.value_kwh} />
          </p>
          <p>
            <FieldLabel text="Джерело даних" />
            <input style={{ ...styles.input, ...(errors.source ? styles.inputError : {}) }} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Джерело" />
            <FieldError text={errors.source} />
          </p>
          <button style={styles.button} type="submit">Зберегти показ</button>
        </form>
        <p style={{ marginTop: 10 }}>
          <button
            style={styles.button}
            onClick={async () => {
              try {
                await runValidation();
                await load();
                pushToast("Валідацію виконано.", "success");
              } catch {
                pushToast("Не вдалося виконати валідацію.", "error");
              }
            }}
            type="button"
          >
            Запустити валідацію
          </button>
        </p>
      </div>
      <div style={styles.card}>
        <h3>Останні покази</h3>
        <div style={styles.toolbar}>
          <div style={{ minWidth: 260 }}>
            <FieldLabel text="Пошук по таблиці" />
            <input style={{ ...styles.input, maxWidth: 280 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Фільтр за джерелом або ID лічильника" />
          </div>
          <label style={styles.muted}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} /> автооновлення (5с)
          </label>
        </div>
        <DataTable
          columns={["ID", "Лічильник", "Час", "кВт·год", "Джерело"]}
          rows={rows
            .filter((r) => `${r.meter_id} ${r.source}`.toLowerCase().includes(query.toLowerCase()))
            .map((r) => [r.id, meterNameById[r.meter_id] ?? r.meter_id, new Date(r.ts).toLocaleString(), r.value_kwh, r.source])}
        />
      </div>
    </div>
  );
}
