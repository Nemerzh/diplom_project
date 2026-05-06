import { DataTable, styles } from "../ui.jsx";
import { StatusBadge } from "./ReportBadges.jsx";
import { formatDateTime } from "../utils/datetime.js";

function sevVariant(code) {
  const c = String(code || "").toLowerCase();
  if (c === "critical") return "critical";
  if (c === "warning" || c === "medium") return "warning";
  return "neutral";
}

function sevLabelUa(code) {
  const c = String(code || "").toLowerCase();
  if (c === "critical") return "Критичне";
  if (c === "warning") return "Попередження";
  if (c === "medium") return "Середня важливість";
  if (c === "high") return "Висока";
  if (c === "low") return "Низька";
  return code || "—";
}

export default function AlertsSummaryCard({ alerts, summaryBySeverity }) {
  const sevRows = Object.entries(summaryBySeverity || {}).map(([code, count]) => [
    <StatusBadge key={code} label={sevLabelUa(code)} variant={sevVariant(code)} />,
    String(count)
  ]);

  return (
    <div style={styles.card}>
      <h3 style={{ marginTop: 0 }}>Сповіщення за період</h3>
      {sevRows.length > 0 ? (
        <DataTable columns={["Рівень", "Кількість"]} rows={sevRows} />
      ) : (
        <p style={styles.muted}>Сповіщень немає</p>
      )}
      <h4 style={{ marginTop: 14 }}>Останні події</h4>
      <DataTable
        columns={["Час", "Вузол", "Рівень", "Повідомлення"]}
        rows={(alerts || []).slice(0, 25).map((a) => [
          formatDateTime(a.created_at),
          a.node,
          <StatusBadge key={a.id} label={a.severity} variant={sevVariant(a.severity_code)} />,
          a.message
        ])}
      />
    </div>
  );
}
