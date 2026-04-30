import { useEffect, useState } from "react";
import { getMeters, getSites } from "../api";
import { DataTable, FieldLabel, styles } from "../ui.jsx";

export default function MetersPage() {
  const [meters, setMeters] = useState([]);
  const [sites, setSites] = useState([]);
  const [query, setQuery] = useState("");

  const load = async () => {
    const [metersData, sitesData] = await Promise.all([getMeters(), getSites()]);
    setMeters(metersData);
    setSites(sitesData);
  };
  useEffect(() => { load(); }, []);
  const siteNameById = Object.fromEntries(sites.map((s) => [s.id, s.name]));

  return (
    <div style={styles.card}>
      <h3>Список лічильників</h3>
      <p style={styles.muted}>CRUD операції для лічильників доступні в Адмін панелі.</p>
      <div style={styles.toolbar}>
        <button style={styles.buttonSecondary} onClick={load}>Оновити</button>
        <div style={{ minWidth: 280 }}>
          <FieldLabel text="Пошук лічильників" />
          <input style={{ ...styles.input, maxWidth: 320 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Пошук за серійним номером або статусом" />
        </div>
      </div>
      <DataTable
        columns={["Об'єкт", "Серійний номер", "Тип", "Статус"]}
        rows={meters
          .filter((m) => `${m.serial_number} ${m.status}`.toLowerCase().includes(query.toLowerCase()))
          .map((m) => [siteNameById[m.site_id] ?? m.site_id, m.serial_number, m.meter_type, m.status])}
      />
    </div>
  );
}
