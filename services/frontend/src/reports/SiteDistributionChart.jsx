import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { styles } from "../ui.jsx";

export default function SiteDistributionChart({ sitesDistribution }) {
  const data = (sitesDistribution || []).map((s) => ({
    name: s.name,
    kWh: Number(s.total_kwh || 0),
    part: Number(s.share_percent || 0)
  }));

  return (
    <div style={styles.card}>
      <h3 style={{ marginTop: 0 }}>Розподіл по об'єктах</h3>
      <p style={styles.muted}>Внесок кожного об'єкта на лінії (кВт·год та частка від лінії)</p>
      <div style={{ width: "100%", height: 300 }}>
        {data.length === 0 ? (
          <div style={styles.muted}>Немає даних</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 11 }} unit=" кВт·год" />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [`${Number(v).toFixed(2)} кВт·год`, "Споживання"]} />
              <Bar dataKey="kWh" fill="#0ea5e9" name="kWh" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <div style={{ marginTop: 10, display: "grid", gap: 4 }}>
        {data.map((d) => (
          <div key={d.name} style={{ fontSize: 13, color: "#374151" }}>
            <b>{d.name}</b>: {d.kWh.toFixed(2)} кВт·год ({d.part.toFixed(1)}% лінії)
          </div>
        ))}
      </div>
    </div>
  );
}
