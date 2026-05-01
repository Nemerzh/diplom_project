import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FieldLabel, styles } from "../ui.jsx";

function mergeDaily(aDaily, bDaily) {
  const map = new Map();
  for (const r of aDaily || []) {
    const k = new Date(r.day).toISOString().slice(0, 10);
    map.set(k, { day: k, a: Number(r.total_kwh || 0), b: 0 });
  }
  for (const r of bDaily || []) {
    const k = new Date(r.day).toISOString().slice(0, 10);
    const cur = map.get(k) || { day: k, a: 0, b: 0 };
    cur.b = Number(r.total_kwh || 0);
    map.set(k, cur);
  }
  return Array.from(map.values()).sort((x, y) => x.day.localeCompare(y.day));
}

export default function SiteComparisonPanel({ sitesDistribution, onCompare, compare, loading }) {
  const [siteA, setSiteA] = useState("");
  const [siteB, setSiteB] = useState("");
  const options = sitesDistribution || [];

  const chartData = useMemo(() => {
    if (!compare) return [];
    return mergeDaily(compare.site_a?.daily, compare.site_b?.daily).map((r) => ({
      ...r,
      label: new Date(r.day).toLocaleDateString("uk-UA")
    }));
  }, [compare]);

  return (
    <div style={styles.card}>
      <h3 style={{ marginTop: 0 }}>Порівняння двох об'єктів на лінії</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
        <div style={{ minWidth: 200 }}>
          <FieldLabel text="Об'єкт A" />
          <select style={styles.input} value={siteA} onChange={(e) => setSiteA(e.target.value)}>
            <option value="">— оберіть —</option>
            {options.map((s) => (
              <option key={s.site_id} value={s.site_id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ minWidth: 200 }}>
          <FieldLabel text="Об'єкт B" />
          <select style={styles.input} value={siteB} onChange={(e) => setSiteB(e.target.value)}>
            <option value="">— оберіть —</option>
            {options.map((s) => (
              <option key={`b-${s.site_id}`} value={s.site_id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          style={styles.button}
          disabled={loading || !siteA || !siteB || siteA === siteB}
          onClick={() => onCompare(Number(siteA), Number(siteB))}
        >
          Порівняти
        </button>
      </div>
      {compare ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "grid", gap: 6, fontSize: 14 }}>
            <div>
              <b>{compare.site_a.name}</b>: {Number(compare.site_a.total_kwh).toFixed(2)} кВт·год
            </div>
            <div>
              <b>{compare.site_b.name}</b>: {Number(compare.site_b.total_kwh).toFixed(2)} кВт·год
            </div>
            <div>
              Різниця: <b>{Number(compare.difference_kwh).toFixed(2)} кВт·год</b>
              {compare.difference_pct_vs_site_b != null ? (
                <span> ({Number(compare.difference_pct_vs_site_b).toFixed(1)}% до B)</span>
              ) : null}
            </div>
          </div>
          <div style={{ width: "100%", height: 260, marginTop: 12 }}>
            {chartData.length === 0 ? (
              <div style={styles.muted}>Немає добових точок</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} width={56} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="a" name={compare.site_a.name} stroke="#2563eb" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="b" name={compare.site_b.name} stroke="#f97316" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
