import { useEffect, useState } from "react";
import { getAlerts, getMeters, getSites, runAlerts } from "../api";
import { DataTable, FieldLabel, Toasts, styles } from "../ui.jsx";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [sites, setSites] = useState([]);
  const [meters, setMeters] = useState([]);
  const [severityFilter, setSeverityFilter] = useState("");
  const [toasts, setToasts] = useState([]);

  const pushToast = (text, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2500);
  };

  const load = async () => {
    const [alertsData, sitesData, metersData] = await Promise.all([getAlerts(), getSites(), getMeters()]);
    setAlerts(alertsData);
    setSites(sitesData);
    setMeters(metersData);
  };
  useEffect(() => { load(); }, []);
  const siteNameById = Object.fromEntries(sites.map((s) => [s.id, s.name]));
  const meterNameById = Object.fromEntries(meters.map((m) => [m.id, m.serial_number]));

  return (
    <div style={styles.card}>
      <Toasts items={toasts} />
      <h3>Активні сповіщення</h3>
      <p style={styles.muted}>Керування правилами сповіщень доступне лише в Адмін панелі.</p>
      <div style={styles.toolbar}>
        <button style={styles.buttonSecondary} onClick={load}>Оновити</button>
        <button
          style={styles.button}
          onClick={async () => {
            try {
              await runAlerts();
              await load();
              pushToast("Перевірку сповіщень виконано.", "success");
            } catch {
              pushToast("Не вдалося виконати перевірку сповіщень.", "error");
            }
          }}
          type="button"
        >
          Запустити перевірку
        </button>
        <div style={{ minWidth: 220 }}>
          <FieldLabel text="Рівень критичності" />
          <select style={{ ...styles.input, maxWidth: 220 }} value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
            <option value="">Всі рівні критичності</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </div>
      </div>
      <DataTable
        columns={["Тип", "Критичність", "Об'єкт", "Лічильник", "Повідомлення"]}
        rows={alerts
          .filter((a) => (severityFilter ? a.severity === severityFilter : true))
          .map((a) => [
            a.type,
            a.severity,
            a.site_id ? (siteNameById[a.site_id] ?? a.site_id) : "-",
            a.meter_id ? (meterNameById[a.meter_id] ?? a.meter_id) : "-",
            a.message
          ])}
      />
    </div>
  );
}
