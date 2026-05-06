import { useState } from "react";
import { DataTable, styles } from "../ui.jsx";
import { StatusBadge, meterStatusVariant } from "./ReportBadges.jsx";
import { formatDateTime } from "../utils/datetime.js";

export default function HierarchicalDetailsTable({ hierarchyTable, metersBySite }) {
  const [openSite, setOpenSite] = useState(null);
  if (!hierarchyTable?.length) return null;

  const lineRow = hierarchyTable.find((r) => r.level === "line");
  const siteRows = hierarchyTable.filter((r) => r.level === "site");

  const siteTableRows = siteRows.map((s) => [
    s.name,
    Number(s.total_kwh).toFixed(2),
    `${Number(s.share_percent_line || 0).toFixed(1)}%`,
    <button type="button" key={s.id} style={styles.buttonSecondary} onClick={() => setOpenSite(openSite === s.id ? null : s.id)}>
      {openSite === s.id ? "Сховати лічильники" : "Лічильники"}
    </button>
  ]);

  return (
    <div style={styles.card}>
      <h3 style={{ marginTop: 0 }}>Деталізація</h3>
      {lineRow ? (
        <p style={{ fontSize: 14 }}>
          <b>Лінія:</b> {lineRow.name} — <b>{Number(lineRow.total_kwh).toFixed(2)} кВт·год</b> за період
        </p>
      ) : null}
      <h4 style={{ marginBottom: 8 }}>Об'єкти</h4>
      <DataTable columns={["Об'єкт", "кВт·год", "Частка лінії", "Дія"]} rows={siteTableRows} />
      {openSite != null ? (
        <div style={{ marginTop: 12 }}>
          <h4 style={{ marginBottom: 8 }}>Лічильники об'єкта</h4>
          <DataTable
            columns={["Серійний №", "Зона", "Роль", "кВт·год", "Частка лінії", "Останній зв'язок", "Статус"]}
            rows={(metersBySite[String(openSite)] || []).map((m) => [
              m.serial_number,
              m.zone_name,
              m.meter_role,
              Number(m.consumption_kwh).toFixed(2),
              `${Number(m.share_percent).toFixed(1)}%`,
              formatDateTime(m.last_seen_at),
              <StatusBadge key={m.meter_id} label={m.status} variant={meterStatusVariant(m.status)} />
            ])}
          />
        </div>
      ) : null}
    </div>
  );
}
