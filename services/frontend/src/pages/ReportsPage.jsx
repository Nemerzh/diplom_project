import { useEffect, useState } from "react";
import {
  compareSites,
  getDailyReports,
  getEnterprises,
  getHierarchyReport,
  getMonthlyReports,
  getReportsSummary,
  getSites,
  rebuildReports
} from "../api";
import { DataTable, FieldLabel, Toasts, styles } from "../ui.jsx";

function nodeKey(node) {
  return `${node.node_type}:${node.id}`;
}

function severityOf(node) {
  const deltaPct = Number(node?.delta_pct);
  if (Number.isNaN(deltaPct)) return "ok";
  if (deltaPct >= 25) return "critical";
  if (deltaPct >= 10) return "warning";
  return "ok";
}

function severityStyle(level) {
  if (level === "critical") return { color: "#b91c1c", fontWeight: 700 };
  if (level === "warning") return { color: "#b45309", fontWeight: 700 };
  return { color: "#166534", fontWeight: 600 };
}

export default function ReportsPage() {
  const [enterprises, setEnterprises] = useState([]);
  const [enterpriseId, setEnterpriseId] = useState("");
  const [daily, setDaily] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [summary, setSummary] = useState(null);
  const [hierarchy, setHierarchy] = useState(null);
  const [sites, setSites] = useState([]);
  const [cmp, setCmp] = useState(null);
  const [siteA, setSiteA] = useState("");
  const [siteB, setSiteB] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [summaryDays, setSummaryDays] = useState("30");
  const [hierarchyPath, setHierarchyPath] = useState([]);
  const [toasts, setToasts] = useState([]);
  const siteNameById = Object.fromEntries(sites.map((s) => [s.id, s.name]));

  const pushToast = (text, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2500);
  };

  const load = async () => {
    if (!enterpriseId) return;
    const params = {
      fromDate: fromDate ? new Date(`${fromDate}T00:00:00Z`).toISOString() : undefined,
      toDate: toDate ? new Date(`${toDate}T23:59:59Z`).toISOString() : undefined,
      enterpriseId
    };
    const [d, m, s, sum, h] = await Promise.all([
      getDailyReports(params),
      getMonthlyReports(params),
      getSites(),
      getReportsSummary(Number(summaryDays) || 30, enterpriseId),
      getHierarchyReport(params)
    ]);
    setDaily(d);
    setMonthly(m);
    setSites(s);
    setSummary(sum);
    setHierarchy(h);
    setHierarchyPath([]);
    const entSites = s.filter((st) => String(st.enterprise_id) === String(enterpriseId));
    if (entSites.length > 0) {
      setSiteA(String(entSites[0].id));
      setSiteB(String(entSites.length > 1 ? entSites[1].id : entSites[0].id));
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const list = await getEnterprises();
        setEnterprises(list);
        if (list.length > 0) {
          setEnterpriseId((prev) => prev || String(list[0].id));
        }
      } catch {
        setEnterprises([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!enterpriseId) return;
    load();
  }, [enterpriseId, fromDate, toDate, summaryDays]);

  const fmt = (value) => Number(value || 0).toFixed(2);
  const fmtPct = (value) => (value == null ? "n/a" : `${Number(value).toFixed(1)}%`);
  const hierarchyRoots = hierarchy?.tree || [];
  const sitesForEnterprise = sites.filter((st) => String(st.enterprise_id) === String(enterpriseId));
  const breadcrumbs = [];
  let currentNodes = hierarchyRoots;
  for (const pathKey of hierarchyPath) {
    const matched = currentNodes.find((node) => nodeKey(node) === pathKey);
    if (!matched) break;
    breadcrumbs.push(matched);
    currentNodes = matched.children || [];
  }
  const levelTitle =
    breadcrumbs.length > 0
      ? breadcrumbs[breadcrumbs.length - 1].name
      : hierarchy?.enterprise?.name
        ? `${hierarchy.enterprise.name} — мережа`
        : "Підприємства";
  const currentRows = [...currentNodes].sort((a, b) => Number(b.total_kwh || 0) - Number(a.total_kwh || 0));
  const allNodes = [];
  const collectNodes = (nodes) => {
    for (const n of nodes || []) {
      allNodes.push(n);
      collectNodes(n.children || []);
    }
  };
  collectNodes(hierarchyRoots);
  const topProblems = allNodes
    .filter((n) => ["site", "meter", "line"].includes(n.node_type))
    .filter((n) => Number(n.delta_pct || 0) >= 10)
    .sort((a, b) => Number(b.delta_pct || 0) - Number(a.delta_pct || 0))
    .slice(0, 5);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Toasts items={toasts} />
      <div style={styles.card}>
        <h3>Дії з агрегаціями</h3>
        <button
          style={styles.button}
          onClick={async () => {
            try {
              await rebuildReports();
              await load();
              pushToast("Звіти перебудовано.", "success");
            } catch {
              pushToast("Не вдалося перебудувати звіти.", "error");
            }
          }}
        >
          Перебудувати звіти
        </button>
      </div>
      <div style={styles.card}>
        <h3>Параметри звітів</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <div style={{ minWidth: 260 }}>
            <FieldLabel text="Підприємство" />
            <select
              style={styles.input}
              value={enterpriseId}
              onChange={(e) => {
                setEnterpriseId(e.target.value);
                setCmp(null);
                setHierarchyPath([]);
              }}
            >
              {enterprises.length === 0 ? (
                <option value="">Немає підприємств</option>
              ) : (
                enterprises.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.id} — {e.name}
                  </option>
                ))
              )}
            </select>
          </div>
          <div style={{ minWidth: 190 }}>
            <FieldLabel text="Від дати" />
            <input type="date" style={styles.input} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div style={{ minWidth: 190 }}>
            <FieldLabel text="До дати" />
            <input type="date" style={styles.input} value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div style={{ minWidth: 120 }}>
            <FieldLabel text="KPI, днів" />
            <input
              type="number"
              min="1"
              max="365"
              style={styles.input}
              value={summaryDays}
              onChange={(e) => setSummaryDays(e.target.value)}
            />
          </div>
          <button
            style={styles.button}
            onClick={async () => {
              try {
                await load();
                setCmp(null);
                pushToast("Звіти оновлено за фільтрами.", "success");
              } catch {
                pushToast("Не вдалося оновити звіти.", "error");
              }
            }}
          >
            Застосувати
          </button>
        </div>
      </div>
      {enterpriseId && summary ? (
        <div style={styles.grid4}>
          <div style={styles.card}>
            <div style={styles.muted}>Сумарно за період</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{fmt(summary.kpi?.total_kwh)} кВт·год</div>
          </div>
          <div style={styles.card}>
            <div style={styles.muted}>Середньодобово</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{fmt(summary.kpi?.avg_daily_kwh)} кВт·год</div>
          </div>
          <div style={styles.card}>
            <div style={styles.muted}>Активні об'єкти / лічильники</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              {summary.kpi?.active_sites ?? 0} / {summary.kpi?.active_meters ?? 0}
            </div>
          </div>
          <div style={styles.card}>
            <div style={styles.muted}>Тренд до попереднього періоду</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{fmtPct(summary.kpi?.trend_pct_vs_prev_period)}</div>
          </div>
        </div>
      ) : null}
      {enterpriseId && hierarchy ? (
        <div style={styles.card}>
          <h3>Структурований звіт (drill-down)</h3>
          <div style={styles.muted}>
            Період: {new Date(hierarchy.period.from_date).toLocaleString()} — {new Date(hierarchy.period.to_date).toLocaleString()}
            {hierarchy.enterprise ? ` · ${hierarchy.enterprise.name}` : ""}
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={styles.muted}>Рівень:</span>
            <button style={styles.buttonSecondary} onClick={() => setHierarchyPath([])}>
              {hierarchy.enterprise ? "На початок (мережа)" : "Підприємства"}
            </button>
            {breadcrumbs.map((crumb, idx) => (
              <button
                key={nodeKey(crumb)}
                style={styles.buttonSecondary}
                onClick={() => setHierarchyPath(hierarchyPath.slice(0, idx + 1))}
              >
                {crumb.name}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <DataTable
              columns={["Рівень", "Назва", "кВт·год", "Δ кВт·год", "Δ %", "Частка", "Статус", "Дія"]}
              rows={currentRows.map((node) => {
                const severity = severityOf(node);
                const action = (node.children || []).length > 0 ? "Відкрити" : "-";
                return [
                  node.node_type,
                  node.name,
                  fmt(node.total_kwh),
                  fmt(node.delta_kwh),
                  fmtPct(node.delta_pct),
                  fmtPct(node.percent_of_parent),
                  severity.toUpperCase(),
                  action
                ];
              })}
            />
          </div>
          <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
            <div><b>Поточний вузол:</b> {levelTitle}</div>
            <div style={styles.muted}>Клікни “Відкрити” в рядку нижче, щоб провалитись на рівень глибше.</div>
          </div>
          <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
            {currentRows.map((node) => (
              (node.children || []).length > 0 ? (
                <button
                  key={`open-${nodeKey(node)}`}
                  style={styles.buttonSecondary}
                  onClick={() => setHierarchyPath([...hierarchyPath, nodeKey(node)])}
                >
                  Відкрити: {node.name}
                </button>
              ) : null
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <h4 style={{ margin: "8px 0" }}>Топ проблем (Δ%):</h4>
            {topProblems.length === 0 ? (
              <div style={styles.muted}>Проблемні вузли не виявлено.</div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {topProblems.map((node) => {
                  const sev = severityOf(node);
                  return (
                    <div key={`problem-${nodeKey(node)}`} style={{ ...severityStyle(sev), fontSize: 14 }}>
                      {node.node_type}: {node.name} — Δ {fmtPct(node.delta_pct)} ({fmt(node.delta_kwh)} кВт·год)
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
      <div style={styles.grid2}>
        <div style={styles.card}>
          <h3>Добовий звіт</h3>
          {!enterpriseId ? (
            <div style={styles.muted}>Оберіть підприємство.</div>
          ) : (
            <DataTable columns={["Об'єкт", "Лічильник", "День", "кВт·год"]} rows={daily.slice(0, 50).map((r) => [siteNameById[r.site_id] ?? r.site_id, r.meter_id, new Date(r.day).toLocaleDateString(), Number(r.total_kwh).toFixed(2)])} />
          )}
        </div>
        <div style={styles.card}>
          <h3>Місячний звіт</h3>
          {!enterpriseId ? (
            <div style={styles.muted}>Оберіть підприємство.</div>
          ) : (
            <DataTable columns={["Об'єкт", "Лічильник", "Місяць", "кВт·год"]} rows={monthly.slice(0, 50).map((r) => [siteNameById[r.site_id] ?? r.site_id, r.meter_id, new Date(r.month).toLocaleDateString(), Number(r.total_kwh).toFixed(2)])} />
          )}
        </div>
      </div>
      <div style={styles.card}>
        <h3>Порівняння двох об'єктів</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ minWidth: 240 }}>
            <FieldLabel text="Об'єкт A" />
            <select style={styles.input} value={siteA} onChange={(e) => setSiteA(e.target.value)} disabled={!enterpriseId}>
              {sitesForEnterprise.map((s) => (
                <option key={s.id} value={s.id}>{s.id} - {s.name}</option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 240 }}>
            <FieldLabel text="Об'єкт B" />
            <select style={styles.input} value={siteB} onChange={(e) => setSiteB(e.target.value)} disabled={!enterpriseId}>
              {sitesForEnterprise.map((s) => (
                <option key={s.id} value={s.id}>{s.id} - {s.name}</option>
              ))}
            </select>
          </div>
          <button
            style={styles.button}
            onClick={async () => {
              if (!siteA || !siteB) return pushToast("Оберіть два об'єкти.", "error");
              if (String(siteA) === String(siteB)) return pushToast("Об'єкти мають бути різними.", "error");
              try {
                setCmp(
                  await compareSites(Number(siteA), Number(siteB), {
                    fromDate: fromDate ? new Date(`${fromDate}T00:00:00Z`).toISOString() : undefined,
                    toDate: toDate ? new Date(`${toDate}T23:59:59Z`).toISOString() : undefined,
                    enterpriseId
                  })
                );
              } catch {
                pushToast("Не вдалося виконати порівняння.", "error");
              }
            }}
          >
            Порівняти
          </button>
        </div>
        {cmp ? (
          <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
            <div>
              <b>{cmp.siteA.name}</b>: {fmt(cmp.siteA.total_kwh)} кВт·год
            </div>
            <div>
              <b>{cmp.siteB.name}</b>: {fmt(cmp.siteB.total_kwh)} кВт·год
            </div>
            <div>
              Різниця: <b>{fmt(cmp.difference_kwh)} кВт·год</b> ({fmtPct(cmp.difference_pct_vs_siteB)})
            </div>
          </div>
        ) : null}
      </div>
      {enterpriseId && summary ? (
        <div style={styles.grid2}>
          <div style={styles.card}>
            <h3>Топ об'єкти за споживанням</h3>
            <DataTable
              columns={["Об'єкт", "кВт·год"]}
              rows={(summary.top_sites || []).map((r) => [r.name || `#${r.site_id}`, fmt(r.total_kwh)])}
            />
          </div>
          <div style={styles.card}>
            <h3>Топ лічильники</h3>
            <DataTable
              columns={["Лічильник", "Зона", "кВт·год"]}
              rows={(summary.top_meters || []).map((r) => [r.serial_number || r.meter_id, r.zone_name || "-", fmt(r.total_kwh)])}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
