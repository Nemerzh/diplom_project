import { DataTable, styles } from "../ui.jsx";

export default function TopListsCards({ topSites, topMeters }) {
  return (
    <div style={styles.grid2}>
      <div style={styles.card}>
        <h3 style={{ marginTop: 0 }}>Топ об'єктів</h3>
        <DataTable
          columns={["Об'єкт", "кВт·год"]}
          rows={(topSites || []).map((r) => [r.name, Number(r.total_kwh).toFixed(2)])}
        />
      </div>
      <div style={styles.card}>
        <h3 style={{ marginTop: 0 }}>Топ лічильників</h3>
        <DataTable
          columns={["Лічильник", "Об'єкт", "кВт·год"]}
          rows={(topMeters || []).map((r) => [r.serial_number, r.site_name || "—", Number(r.consumption_kwh ?? r.total_kwh ?? 0).toFixed(2)])}
        />
      </div>
    </div>
  );
}
