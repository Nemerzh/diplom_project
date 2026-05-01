import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAlerts,
  getAlertsSummary,
  getEnterprises,
  getMeters,
  getSites,
  resolveAlert,
  runAlerts
} from "../api";
import { FieldLabel, Toasts, styles } from "../ui.jsx";

function severityBadgeStyle(sev) {
  const s = String(sev || "").toLowerCase();
  const map = {
    critical: { bg: "#fecaca", color: "#7f1d1d", border: "#f87171" },
    high: { bg: "#fde68a", color: "#92400e", border: "#fbbf24" },
    medium: { bg: "#bfdbfe", color: "#1e3a8a", border: "#60a5fa" },
    low: { bg: "#e5e7eb", color: "#374151", border: "#9ca3af" },
    warning: { bg: "#fef08a", color: "#854d0e", border: "#eab308" }
  };
  return map[s] || { bg: "#f3f4f6", color: "#111827", border: "#d1d5db" };
}

function fmtDt(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("uk-UA", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

const SEVERITY_UA = {
  critical: "Критична",
  high: "Висока",
  medium: "Середня",
  low: "Низька",
  warning: "Попередження"
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [enterprises, setEnterprises] = useState([]);
  const [sites, setSites] = useState([]);
  const [meters, setMeters] = useState([]);
  const [activeOnly, setActiveOnly] = useState(true);
  const [severityFilter, setSeverityFilter] = useState("");
  const [enterpriseId, setEnterpriseId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [meterId, setMeterId] = useState("");
  const [resolvingId, setResolvingId] = useState(null);
  const [toasts, setToasts] = useState([]);

  const pushToast = (text, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2800);
  };

  const listParams = useMemo(() => {
    const p = { active_only: activeOnly, limit: 300 };
    if (severityFilter) p.severity = severityFilter;
    if (enterpriseId) p.enterprise_id = Number(enterpriseId);
    if (siteId) p.site_id = Number(siteId);
    if (meterId) p.meter_id = Number(meterId);
    return p;
  }, [activeOnly, severityFilter, enterpriseId, siteId, meterId]);

  const summaryParams = useMemo(() => {
    const p = { active_only: activeOnly };
    if (enterpriseId) p.enterprise_id = Number(enterpriseId);
    return p;
  }, [activeOnly, enterpriseId]);

  const loadLists = useCallback(async () => {
    const [entList, siteList, meterList] = await Promise.all([getEnterprises(), getSites(), getMeters()]);
    setEnterprises(entList);
    setSites(siteList);
    setMeters(meterList);
  }, []);

  const loadAlerts = useCallback(async () => {
    const [alertsData, summaryData] = await Promise.all([getAlerts(listParams), getAlertsSummary(summaryParams)]);
    setAlerts(alertsData);
    setSummary(summaryData);
  }, [listParams, summaryParams]);

  useEffect(() => {
    loadLists().catch(() => pushToast("Не вдалося завантажити довідники.", "error"));
  }, [loadLists]);

  useEffect(() => {
    loadAlerts().catch(() => pushToast("Не вдалося завантажити сповіщення.", "error"));
  }, [loadAlerts]);

  const sitesFiltered = useMemo(() => {
    if (!enterpriseId) return sites;
    return sites.filter((s) => String(s.enterprise_id) === String(enterpriseId));
  }, [sites, enterpriseId]);

  const metersFiltered = useMemo(() => {
    if (!siteId) return enterpriseId ? meters.filter((m) => sitesFiltered.some((s) => s.id === m.site_id)) : meters;
    return meters.filter((m) => String(m.site_id) === String(siteId));
  }, [meters, siteId, enterpriseId, sitesFiltered]);

  const onEnterpriseChange = (v) => {
    setEnterpriseId(v);
    setSiteId("");
    setMeterId("");
  };

  const onSiteChange = (v) => {
    setSiteId(v);
    setMeterId("");
  };

  const onResolve = async (id) => {
    setResolvingId(id);
    try {
      await resolveAlert(id);
      await loadAlerts();
      pushToast("Сповіщення закрито.", "success");
    } catch {
      pushToast("Не вдалося закрити сповіщення.", "error");
    } finally {
      setResolvingId(null);
    }
  };

  const onRunCheck = async () => {
    try {
      await runAlerts();
      await loadAlerts();
      pushToast("Перевірку сповіщень виконано.", "success");
    } catch {
      pushToast("Не вдалося виконати перевірку сповіщень.", "error");
    }
  };

  const sevOrder = ["critical", "high", "medium", "warning", "low"];

  return (
    <div style={styles.card}>
      <Toasts items={toasts} />
      <h3 style={{ marginTop: 0 }}>Сповіщення</h3>
      <p style={styles.muted}>Правила налаштовуються в Адмін панелі. Тут — перегляд, фільтри та закриття інцидентів.</p>

      {summary && (
        <div style={{ ...styles.grid4, marginBottom: 14 }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, background: "#fafafa" }}>
            <div style={styles.muted}>Усього (за фільтром)</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.total ?? 0}</div>
          </div>
          {sevOrder.map((k) => {
            const n = summary.by_severity?.[k] ?? 0;
            const st = severityBadgeStyle(k);
            return (
              <div
                key={k}
                style={{
                  border: `1px solid ${st.border}`,
                  borderRadius: 8,
                  padding: 12,
                  background: st.bg
                }}
              >
                <div style={{ ...styles.muted, color: st.color }}>{SEVERITY_UA[k] ?? k}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: st.color }}>{n}</div>
              </div>
            );
          })}
        </div>
      )}

      <div style={styles.toolbar}>
        <button type="button" style={styles.buttonSecondary} onClick={() => loadAlerts()}>
          Оновити
        </button>
        <button type="button" style={styles.button} onClick={onRunCheck}>
          Запустити перевірку
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
          Лише активні
        </label>
      </div>

      <div style={{ ...styles.grid4, marginBottom: 12 }}>
        <div>
          <FieldLabel text="Підприємство" />
          <select style={styles.input} value={enterpriseId} onChange={(e) => onEnterpriseChange(e.target.value)}>
            <option value="">Усі</option>
            {enterprises.map((e) => (
              <option key={e.id} value={String(e.id)}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel text="Об'єкт" />
          <select style={styles.input} value={siteId} onChange={(e) => onSiteChange(e.target.value)}>
            <option value="">Усі</option>
            {sitesFiltered.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel text="Лічильник" />
          <select style={styles.input} value={meterId} onChange={(e) => setMeterId(e.target.value)}>
            <option value="">Усі</option>
            {metersFiltered.map((m) => (
              <option key={m.id} value={String(m.id)}>
                {m.serial_number ?? m.id}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel text="Критичність" />
          <select style={styles.input} value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
            <option value="">Усі рівні</option>
            <option value="critical">Критична</option>
            <option value="high">Висока</option>
            <option value="medium">Середня</option>
            <option value="low">Низька</option>
            <option value="warning">Попередження</option>
          </select>
        </div>
      </div>

      <div style={styles.tableWrap}>
        <table style={{ ...styles.table, minWidth: 960 }}>
          <thead>
            <tr>
              <th style={styles.thtd}>Тип / вузол</th>
              <th style={styles.thtd}>Критичність</th>
              <th style={styles.thtd}>Підприємство</th>
              <th style={styles.thtd}>Топологія</th>
              <th style={styles.thtd}>Повідомлення</th>
              <th style={styles.thtd}>Створено</th>
              <th style={styles.thtd}>Дія</th>
            </tr>
          </thead>
          <tbody>
            {alerts.length === 0 ? (
              <tr>
                <td colSpan={7} style={styles.thtd}>
                  <span style={styles.muted}>Немає записів за обраними умовами.</span>
                </td>
              </tr>
            ) : (
              alerts.map((a) => {
                const sb = severityBadgeStyle(a.severity);
                const topo = [
                  a.substation_name,
                  a.line_name,
                  a.site_name,
                  a.meter_serial ? `Ліч.: ${a.meter_serial}` : null
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <tr key={a.id}>
                    <td style={styles.thtd}>
                      <div style={{ fontWeight: 600 }}>{a.alert_type_ua ?? a.alert_type}</div>
                      <div style={styles.muted}>{a.node_ua}</div>
                    </td>
                    <td style={styles.thtd}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontSize: 13,
                          fontWeight: 600,
                          background: sb.bg,
                          color: sb.color,
                          border: `1px solid ${sb.border}`
                        }}
                      >
                        {a.severity_ua ?? a.severity}
                      </span>
                    </td>
                    <td style={styles.thtd}>{a.enterprise_name ?? "—"}</td>
                    <td style={styles.thtd}>{topo || "—"}</td>
                    <td style={styles.thtd}>{a.message}</td>
                    <td style={styles.thtd}>{fmtDt(a.created_at)}</td>
                    <td style={styles.thtd}>
                      {a.is_active ? (
                        <button
                          type="button"
                          style={styles.buttonSecondary}
                          disabled={resolvingId === a.id}
                          onClick={() => onResolve(a.id)}
                        >
                          {resolvingId === a.id ? "…" : "Закрити"}
                        </button>
                      ) : (
                        <span style={styles.muted}>Закрито {fmtDt(a.resolved_at)}</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
