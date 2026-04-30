import { useEffect, useState } from "react";
import { getEnterprises, getSites } from "../api";
import { DataTable, FieldLabel, styles } from "../ui.jsx";

export default function SitesPage() {
  const [sites, setSites] = useState([]);
  const [enterprises, setEnterprises] = useState([]);
  const [query, setQuery] = useState("");

  const load = async () => {
    const [sitesData, enterprisesData] = await Promise.all([getSites(), getEnterprises()]);
    setSites(sitesData);
    setEnterprises(enterprisesData);
  };
  useEffect(() => { load(); }, []);
  const enterpriseNameById = Object.fromEntries(enterprises.map((e) => [e.id, e.name]));

  return (
    <div style={styles.card}>
      <h3>Список об'єктів</h3>
      <p style={styles.muted}>Для створення/редагування/видалення перейдіть у Адмін панель.</p>
      <div style={styles.toolbar}>
        <button style={styles.buttonSecondary} onClick={load}>Оновити</button>
        <div style={{ minWidth: 280 }}>
          <FieldLabel text="Пошук об'єктів" />
          <input style={{ ...styles.input, maxWidth: 320 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Пошук за назвою або локацією" />
        </div>
      </div>
      <DataTable
        columns={["Підприємство", "Назва", "Локація"]}
        rows={sites
          .filter((s) => `${s.name} ${s.location || ""}`.toLowerCase().includes(query.toLowerCase()))
          .map((s) => [enterpriseNameById[s.enterprise_id] ?? s.enterprise_id, s.name, s.location])}
      />
    </div>
  );
}
