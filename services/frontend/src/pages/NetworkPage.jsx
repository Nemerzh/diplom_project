import { useEffect, useMemo, useState } from "react";
import { getLines, getSubstations, getTransformers } from "../api";
import { DataTable, FieldLabel, styles } from "../ui.jsx";

export default function NetworkPage() {
  const [substations, setSubstations] = useState([]);
  const [transformers, setTransformers] = useState([]);
  const [lines, setLines] = useState([]);
  const [selectedSubstation, setSelectedSubstation] = useState("");

  const load = async () => {
    const [s, t, l] = await Promise.all([
      getSubstations(),
      getTransformers(),
      getLines()
    ]);
    setSubstations(s);
    setTransformers(t);
    setLines(l);
    if (!selectedSubstation && s.length > 0) setSelectedSubstation(String(s[0].id));
  };

  useEffect(() => { load(); }, []);

  const transformersFiltered = useMemo(
    () => transformers.filter((t) => !selectedSubstation || String(t.substation_id) === String(selectedSubstation)),
    [transformers, selectedSubstation]
  );
  const transformerIds = new Set(transformersFiltered.map((t) => t.id));
  const linesFiltered = lines.filter((l) => transformerIds.has(l.transformer_id));
  const substationNameById = Object.fromEntries(substations.map((s) => [s.id, `${s.code} - ${s.name}`]));
  const transformerNameById = Object.fromEntries(transformers.map((t) => [t.id, `${t.code} - ${t.name}`]));

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={styles.card}>
        <h3>Дані про електромережу</h3>
        <p style={styles.muted}>Операторський перегляд структури: підстанції, трансформатори, лінії, точки обліку.</p>
        <div style={styles.toolbar}>
          <button style={styles.buttonSecondary} onClick={load}>Оновити</button>
          <div style={{ minWidth: 280 }}>
            <FieldLabel text="Фільтр за підстанцією" />
            <select style={{ ...styles.input, maxWidth: 320 }} value={selectedSubstation} onChange={(e) => setSelectedSubstation(e.target.value)}>
              {substations.map((s) => (
                <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div style={styles.grid4}>
        <div style={styles.card}>Підстанцій: {substations.length}</div>
        <div style={styles.card}>Трансформаторів (вибір): {transformersFiltered.length}</div>
        <div style={styles.card}>Ліній (вибір): {linesFiltered.length}</div>
      </div>

      <div style={styles.grid2}>
        <div style={styles.card}>
          <h3>Трансформатори</h3>
          <DataTable
            columns={["Підстанція", "Код", "Назва", "кВА", "Статус"]}
            rows={transformersFiltered.map((t) => [substationNameById[t.substation_id] ?? t.substation_id, t.code, t.name, t.rated_power_kva ?? "-", t.status])}
          />
        </div>
        <div style={styles.card}>
          <h3>Лінії</h3>
          <DataTable
            columns={["Трансформатор", "Код", "Назва", "кВ", "Статус"]}
            rows={linesFiltered.map((l) => [transformerNameById[l.transformer_id] ?? l.transformer_id, l.code, l.name, l.voltage_kv ?? "-", l.status])}
          />
        </div>
      </div>

    </div>
  );
}
