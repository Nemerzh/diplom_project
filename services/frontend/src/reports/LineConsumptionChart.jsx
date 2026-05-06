import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { styles } from "../ui.jsx";
import { formatDateTime } from "../utils/datetime.js";

export default function LineConsumptionChart({ timeSeries, granularity }) {
  const data = (timeSeries || []).map((row) => ({
    label: formatDateTime(row.bucket, {
      dateStyle: undefined,
      timeStyle: undefined,
      month: "short",
      day: "numeric",
      hour: granularity === "hourly" ? "2-digit" : undefined,
      minute: granularity === "hourly" ? "2-digit" : undefined
    }),
    kWh: Number(row.total_kwh || 0)
  }));

  return (
    <div style={styles.card}>
      <h3 style={{ marginTop: 0 }}>Споживання по лінії</h3>
      <p style={styles.muted}>кВт·год за обрану гранулярність</p>
      <div style={{ width: "100%", height: 320 }}>
        {data.length === 0 ? (
          <div style={styles.muted}>Немає даних за період</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} unit=" кВт·год" width={72} />
              <Tooltip formatter={(v) => [`${Number(v).toFixed(3)} кВт·год`, "Споживання"]} />
              <Line type="monotone" dataKey="kWh" stroke="#2563eb" strokeWidth={2} dot={false} name="кВт·год" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
