import { useEffect, useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getDashboard } from "../api";
import { FieldLabel, styles, Toasts } from "../ui.jsx";

export default function DashboardPage() {
  const [data, setData] = useState({ sites: [], meters: [], readings: [], alerts: [], daily: [] });
  const [points, setPoints] = useState(24);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [toasts, setToasts] = useState([]);

  const pushToast = (text, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2200);
  };

  const refresh = async (showToast = false) => {
    try {
      setIsLoading(true);
      const payload = await getDashboard();
      setData(payload);
      if (showToast) pushToast("Дані оновлено.", "success");
    } catch {
      pushToast("Не вдалося оновити дашборд.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refresh(false);
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => refresh(false), 10000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  const topSites = useMemo(() => {
    const totals = {};
    data.daily.forEach((d) => {
      totals[d.site_id] = (totals[d.site_id] || 0) + Number(d.total_kwh || 0);
    });
    return Object.entries(totals).map(([siteId, total]) => ({ siteId, total })).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [data.daily]);

  const chartData = data.readings
    .slice(0, points)
    .reverse()
    .map((r) => ({ ts: new Date(r.ts).toLocaleTimeString(), value: Number(r.value_kwh) }));

  return (
    <>
      <Toasts items={toasts} />
      <div style={styles.toolbar}>
        <button style={styles.buttonSecondary} onClick={() => refresh(true)} disabled={isLoading}>
          {isLoading ? "Оновлення..." : "Оновити"}
        </button>
        <div>
          <FieldLabel text="Кількість точок графіка" />
          <label style={styles.muted}>
          <select style={{ ...styles.input, width: 100, marginLeft: 6 }} value={points} onChange={(e) => setPoints(Number(e.target.value))}>
            <option value={24}>24</option>
            <option value={48}>48</option>
            <option value={96}>96</option>
          </select>
          </label>
        </div>
        <label style={styles.muted}>
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} /> автооновлення (10с)
        </label>
      </div>
      <div style={styles.grid4}>
        <div style={styles.card}>Об'єкти: {data.sites.length}</div>
        <div style={styles.card}>Лічильники: {data.meters.length}</div>
        <div style={styles.card}>Покази: {data.readings.length}</div>
        <div style={styles.card}>Активні сповіщення: {data.alerts.length}</div>
      </div>
      <div style={{ ...styles.card, marginTop: 16, height: 320 }}>
        <h3>Споживання за останні {points} точок</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chartData}>
            <XAxis dataKey="ts" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="#2563eb" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div style={{ ...styles.card, marginTop: 16 }}>
        <h3>Топ 5 об'єктів</h3>
        {topSites.map((s) => (
          <div key={s.siteId}>Об'єкт {s.siteId}: {s.total.toFixed(2)} кВт·год</div>
        ))}
      </div>
    </>
  );
}
