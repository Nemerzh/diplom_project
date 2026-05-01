import { styles } from "../ui.jsx";

function fmt(v) {
  return Number(v || 0).toLocaleString("uk-UA", { maximumFractionDigits: 2 });
}

function fmtPct(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return `${Number(v).toFixed(1)} %`;
}

export default function ReportKpis({ kpi, context }) {
  if (!kpi) return null;
  const peakLabel = kpi.peak_bucket ? new Date(kpi.peak_bucket).toLocaleString("uk-UA") : "—";
  return (
    <div style={styles.grid4}>
      <div style={styles.card}>
        <div style={styles.muted}>Сумарно по лінії</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{fmt(kpi.total_kwh_line)} кВт·год</div>
        <div style={{ ...styles.muted, marginTop: 4 }}>{context?.line?.name}</div>
      </div>
      <div style={styles.card}>
        <div style={styles.muted}>Середньодобово</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{fmt(kpi.avg_daily_kwh)} кВт·год</div>
      </div>
      <div style={styles.card}>
        <div style={styles.muted}>Пік за період</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{fmt(kpi.peak_kwh)} кВт·год</div>
        <div style={{ ...styles.muted, marginTop: 4 }}>{peakLabel}</div>
      </div>
      <div style={styles.card}>
        <div style={styles.muted}>Активні об'єкти / лічильники</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>
          {kpi.active_sites} / {kpi.active_meters}
        </div>
      </div>
      <div style={styles.card}>
        <div style={styles.muted}>Сповіщень за період</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{kpi.alerts_count}</div>
      </div>
      <div style={styles.card}>
        <div style={styles.muted}>Зміна до попереднього періоду</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtPct(kpi.trend_pct_vs_previous_period)}</div>
        <div style={{ ...styles.muted, marginTop: 4 }}>Попередній період: {fmt(kpi.previous_period_total_kwh)} кВт·год</div>
      </div>
    </div>
  );
}
