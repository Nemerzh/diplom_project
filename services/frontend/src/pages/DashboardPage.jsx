import { useCallback, useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getDashboard } from "../api";
import { FieldLabel, styles, Toasts } from "../ui.jsx";

function fmtInt(n) {
  return Number(n || 0).toLocaleString("uk-UA");
}

function fmtKwh(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return `${x.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} кВт·год`;
}

export default function DashboardPage() {
  const [data, setData] = useState({ sites: [], meters: [], readings: [], alerts: [], daily: [] });
  const [points, setPoints] = useState(48);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [latencyMs, setLatencyMs] = useState(null);
  const [toasts, setToasts] = useState([]);

  const pushToast = (text, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2200);
  };

  const refresh = useCallback(
    async (showToast = false) => {
      try {
        setIsLoading(true);
        const t0 = typeof performance !== "undefined" ? performance.now() : 0;
        const payload = await getDashboard();
        setData(payload);
        setLastRefresh(new Date());
        if (t0) setLatencyMs(Math.round(performance.now() - t0));
        if (showToast) pushToast("Дані оновлено.", "success");
      } catch {
        pushToast("Не вдалося оновити дашборд.", "error");
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    refresh(false);
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => refresh(false), 15000);
    return () => clearInterval(id);
  }, [autoRefresh, refresh]);

  const siteById = useMemo(() => Object.fromEntries(data.sites.map((s) => [s.id, s])), [data.sites]);

  const enterpriseCount = useMemo(() => {
    const ids = new Set(data.sites.map((s) => s.enterprise_id));
    return ids.size;
  }, [data.sites]);

  const metersActive = useMemo(
    () => data.meters.filter((m) => String(m.status).toLowerCase() === "active").length,
    [data.meters]
  );

  const dailySumKwh = useMemo(() => {
    let s = 0;
    for (const d of data.daily) s += Number(d.total_kwh) || 0;
    return s;
  }, [data.daily]);

  const alertSeverity = useMemo(() => {
    const m = { critical: 0, high: 0, medium: 0, low: 0, other: 0 };
    for (const a of data.alerts) {
      const sev = String(a.severity || "").toLowerCase();
      if (sev === "critical") m.critical += 1;
      else if (sev === "high") m.high += 1;
      else if (sev === "medium") m.medium += 1;
      else if (sev === "low") m.low += 1;
      else m.other += 1;
    }
    return m;
  }, [data.alerts]);

  const topSites = useMemo(() => {
    const totals = {};
    data.daily.forEach((d) => {
      totals[d.site_id] = (totals[d.site_id] || 0) + Number(d.total_kwh || 0);
    });
    return Object.entries(totals)
      .map(([siteId, total]) => ({ siteId: Number(siteId), total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [data.daily]);

  const maxTop = topSites.length ? Math.max(...topSites.map((x) => x.total), 1) : 1;

  const chartData = useMemo(() => {
    return data.readings
      .slice(0, points)
      .reverse()
      .map((r) => ({
        ts: new Date(r.ts).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        value: Number(r.value_kwh)
      }));
  }, [data.readings, points]);

  return (
    <>
      <Toasts items={toasts} />

      <div style={styles.card}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Дашборд</h2>
        <p style={{ ...styles.muted, marginTop: 0 }}>
          Огляд обліку: ключові показники, останній потік показів і топ об&apos;єктів за даними денних агрегатів.
        </p>
        <div style={{ ...styles.toolbar, flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
          <button type="button" style={styles.buttonSecondary} onClick={() => refresh(true)} disabled={isLoading}>
            {isLoading ? "Оновлення…" : "Оновити"}
          </button>
          <div>
            <FieldLabel text="Точок на графіку" />
            <select style={{ ...styles.input, width: 100 }} value={points} onChange={(e) => setPoints(Number(e.target.value))}>
              <option value={24}>24</option>
              <option value={48}>48</option>
              <option value={96}>96</option>
              <option value={200}>200</option>
            </select>
          </div>
          <label style={{ ...styles.muted, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} /> Автооновлення (15 с)
          </label>
          {lastRefresh ? (
            <span style={styles.muted}>
              Оновлено: {lastRefresh.toLocaleString("uk-UA")}
              {latencyMs != null ? ` · ${latencyMs} мс` : ""}
            </span>
          ) : null}
        </div>
      </div>

      <div style={styles.grid4}>
        <div style={{ ...styles.card, borderLeft: "4px solid #2563eb" }}>
          <div style={styles.muted}>Об&apos;єкти</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{fmtInt(data.sites.length)}</div>
          <div style={{ ...styles.muted, fontSize: 12, marginTop: 4 }}>Підприємств (унікальних): {enterpriseCount}</div>
        </div>
        <div style={{ ...styles.card, borderLeft: "4px solid #7c3aed" }}>
          <div style={styles.muted}>Лічильники</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>
            {fmtInt(metersActive)} / {fmtInt(data.meters.length)}
          </div>
          <div style={{ ...styles.muted, fontSize: 12, marginTop: 4 }}>активних / усього</div>
        </div>
        <div style={{ ...styles.card, borderLeft: "4px solid #059669" }}>
          <div style={styles.muted}>Покази в буфері</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{fmtInt(data.readings.length)}</div>
          <div style={{ ...styles.muted, fontSize: 12, marginTop: 4 }}>останні записи з API</div>
        </div>
        <div style={{ ...styles.card, borderLeft: "4px solid #dc2626" }}>
          <div style={styles.muted}>Активні сповіщення</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{fmtInt(data.alerts.length)}</div>
          <div style={{ ...styles.muted, fontSize: 12, marginTop: 4 }}>
            крит./висок.: {alertSeverity.critical + alertSeverity.high}
          </div>
        </div>
      </div>

      <div style={{ ...styles.card, marginTop: 12, borderLeft: "4px solid #0ea5e9", maxWidth: 420 }}>
        <div style={styles.muted}>Сума по денних агрегатах</div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtKwh(dailySumKwh)}</div>
        <div style={{ ...styles.muted, fontSize: 12, marginTop: 4 }}>усі доступні рядки daily</div>
      </div>

      <div style={{ ...styles.card, marginTop: 12, minHeight: 340 }}>
        <h3 style={{ marginTop: 0 }}>Останні покази (кВт·год за інтервал)</h3>
        <p style={{ ...styles.muted, marginTop: 0 }}>
          Значення з сирих показів, останні {Math.min(points, data.readings.length)} точок у хронологічному порядку на графіку.
        </p>
        {chartData.length === 0 ? (
          <p style={styles.muted}>Немає показів для графіка.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="ts" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={56} label={{ value: "кВт·год", angle: -90, position: "insideLeft" }} />
              <Tooltip formatter={(v) => [`${Number(v).toFixed(3)} кВт·год`, "Споживання"]} />
              <Line type="monotone" dataKey="value" name="кВт·год" stroke="#2563eb" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div style={{ ...styles.card, marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Топ об&apos;єктів за споживанням (денні агрегати)</h3>
        {topSites.length === 0 ? (
          <p style={styles.muted}>Немає денних агрегатів — перебудуйте звіти або зачекайте на дані.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {topSites.map(({ siteId, total }) => {
              const name = siteById[siteId]?.name ?? `ID ${siteId}`;
              const pct = Math.round((total / maxTop) * 100);
              return (
                <div key={siteId}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>{name}</span>
                    <span style={{ ...styles.muted }}>{fmtKwh(total)}</span>
                  </div>
                  <div style={{ height: 8, background: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "#2563eb", borderRadius: 4 }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
