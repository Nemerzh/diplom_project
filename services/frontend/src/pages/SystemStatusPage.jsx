import { useEffect, useState } from "react";
import { getHealth, getReady, getValidationIssues } from "../api";
import { DataTable, styles } from "../ui.jsx";

export default function SystemStatusPage() {
  const [health, setHealth] = useState({});
  const [ready, setReady] = useState({});
  const [issues, setIssues] = useState([]);

  useEffect(() => {
    getHealth().then(setHealth);
    getReady().then(setReady);
    getValidationIssues().then(setIssues);
  }, []);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={styles.grid2}>
        <div style={styles.card}>
          <h3>Стан здоров'я</h3>
          <pre>{JSON.stringify(health, null, 2)}</pre>
        </div>
        <div style={styles.card}>
          <h3>Готовність</h3>
          <pre>{JSON.stringify(ready, null, 2)}</pre>
        </div>
      </div>
      <div style={styles.card}>
        <h3>Проблеми валідації</h3>
        <DataTable columns={["ID", "Лічильник", "Час", "Прапорець", "Проблема"]} rows={issues.map((i) => [i.id, i.meter_id, new Date(i.ts).toLocaleString(), i.quality_flag, i.issue])} />
      </div>
    </div>
  );
}
