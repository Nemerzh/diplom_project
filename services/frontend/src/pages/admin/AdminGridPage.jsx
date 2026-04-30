import { useEffect, useState } from "react";
import {
  createLine,
  createSubstation,
  createTransformer,
  getEnterprises,
  getLines,
  getSubstations,
  getTransformers
} from "../../api";
import { DataTable, FieldLabel, Toasts, styles } from "../../ui.jsx";

export default function AdminGridPage() {
  const [enterprises, setEnterprises] = useState([]);
  const [substations, setSubstations] = useState([]);
  const [transformers, setTransformers] = useState([]);
  const [lines, setLines] = useState([]);
  const [toasts, setToasts] = useState([]);

  const [subForm, setSubForm] = useState({ enterprise_id: "", code: "", name: "", voltage_in_kv: "110", voltage_out_kv: "10" });
  const [trForm, setTrForm] = useState({ substation_id: "", code: "", name: "", rated_power_kva: "1600", voltage_in_kv: "10", voltage_out_kv: "0.4", status: "active" });
  const [lineForm, setLineForm] = useState({ transformer_id: "", code: "", name: "", voltage_kv: "0.4", status: "active" });
  const [filters, setFilters] = useState({
    enterprise_id: "",
    substation_id: "",
    transformer_id: "",
    line_id: "",
  });
  const enterpriseNameById = Object.fromEntries(enterprises.map((e) => [e.id, e.name]));
  const subCodeById = Object.fromEntries(substations.map((s) => [s.id, s.code]));
  const trCodeById = Object.fromEntries(transformers.map((t) => [t.id, t.code]));
  

  const pushToast = (text, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2500);
  };

  const filteredEnterprises = enterprises;
  const filteredSubstations = filters.enterprise_id
    ? substations.filter((s) => String(s.enterprise_id) === String(filters.enterprise_id))
    : substations;
  const filteredTransformers = filters.substation_id
    ? transformers.filter((t) => String(t.substation_id) === String(filters.substation_id))
    : transformers;
  const filteredLines = filters.transformer_id
    ? lines.filter((l) => String(l.transformer_id) === String(filters.transformer_id))
    : lines;

  const load = async () => {
    const [e, s, t, l] = await Promise.all([
      getEnterprises(),
      getSubstations(),
      getTransformers(),
      getLines()
    ]);
    setEnterprises(e);
    setSubstations(s);
    setTransformers(t);
    setLines(l);
    if (!subForm.enterprise_id && e.length) setSubForm((prev) => ({ ...prev, enterprise_id: String(e[0].id) }));
    if (!trForm.substation_id && s.length) setTrForm((prev) => ({ ...prev, substation_id: String(s[0].id) }));
    if (!lineForm.transformer_id && t.length) setLineForm((prev) => ({ ...prev, transformer_id: String(t[0].id) }));
  };

  useEffect(() => { load(); }, []);

  const submit = async (action, payload, reset) => {
    try {
      await action(payload);
      if (reset) reset();
      await load();
      pushToast("Дані мережі збережено.");
    } catch (err) {
      pushToast(err?.response?.data?.detail || "Помилка збереження.", "error");
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Toasts items={toasts} />
      <div style={styles.card}>
        <h3>Структура електромережі</h3>
        <p style={styles.muted}>Послідовність: Підприємство → Підстанція → Трансформатор → Лінія → Точка обліку.</p>
        <div style={styles.toolbar}>
          <div style={{ minWidth: 220 }}>
            <FieldLabel text="Фільтр: підприємство" />
            <select style={{ ...styles.input, maxWidth: 260 }} value={filters.enterprise_id} onChange={(e) => setFilters((prev) => ({ ...prev, enterprise_id: e.target.value, substation_id: "", transformer_id: "", line_id: "" }))}>
              <option value="">Всі підприємства</option>
              {filteredEnterprises.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 220 }}>
            <FieldLabel text="Фільтр: підстанція" />
            <select style={{ ...styles.input, maxWidth: 260 }} value={filters.substation_id} onChange={(e) => setFilters((prev) => ({ ...prev, substation_id: e.target.value, transformer_id: "", line_id: "" }))}>
              <option value="">Всі підстанції</option>
              {filteredSubstations.map((s) => <option key={s.id} value={s.id}>{s.code} - {s.name}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 220 }}>
            <FieldLabel text="Фільтр: трансформатор" />
            <select style={{ ...styles.input, maxWidth: 260 }} value={filters.transformer_id} onChange={(e) => setFilters((prev) => ({ ...prev, transformer_id: e.target.value, line_id: "" }))}>
              <option value="">Всі трансформатори</option>
              {filteredTransformers.map((t) => <option key={t.id} value={t.id}>{t.code} - {t.name}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 220 }}>
            <FieldLabel text="Фільтр: лінія" />
            <select style={{ ...styles.input, maxWidth: 260 }} value={filters.line_id} onChange={(e) => setFilters((prev) => ({ ...prev, line_id: e.target.value }))}>
              <option value="">Всі лінії</option>
              {filteredLines.map((l) => <option key={l.id} value={l.id}>{l.code} - {l.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div style={styles.card}>
          <h3>Підстанції</h3>
          <div style={styles.toolbar}>
            <div style={{ minWidth: 220 }}>
              <FieldLabel text="Підприємство" />
            <select style={styles.input} value={subForm.enterprise_id} onChange={(e) => setSubForm({ ...subForm, enterprise_id: e.target.value })}>
              {filteredEnterprises.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            </div>
            <div style={{ minWidth: 220 }}>
              <FieldLabel text="Код підстанції" />
            <input style={styles.input} placeholder="Код (PS-...)" value={subForm.code} onChange={(e) => setSubForm({ ...subForm, code: e.target.value })} />
            </div>
            <div style={{ minWidth: 220 }}>
              <FieldLabel text="Назва підстанції" />
            <input style={styles.input} placeholder="Назва" value={subForm.name} onChange={(e) => setSubForm({ ...subForm, name: e.target.value })} />
            </div>
            <button style={styles.button} onClick={() => submit(createSubstation, { ...subForm, enterprise_id: Number(subForm.enterprise_id), voltage_in_kv: Number(subForm.voltage_in_kv), voltage_out_kv: Number(subForm.voltage_out_kv) })}>Додати</button>
          </div>
          <DataTable columns={["ID", "Підприємство", "Код", "Назва", "кВ in/out"]} rows={filteredSubstations.map((s) => [s.id, enterpriseNameById[s.enterprise_id] ?? s.enterprise_id, s.code, s.name, `${s.voltage_in_kv ?? "-"} / ${s.voltage_out_kv ?? "-"}`])} />
      </div>

      <div style={styles.grid2}>
        <div style={styles.card}>
          <h3>Трансформатори</h3>
          <div style={styles.toolbar}>
            <div style={{ minWidth: 220 }}>
              <FieldLabel text="Підстанція" />
            <select style={styles.input} value={trForm.substation_id} onChange={(e) => setTrForm({ ...trForm, substation_id: e.target.value })}>
              {filteredSubstations.map((s) => <option key={s.id} value={s.id}>{s.code} - {s.name}</option>)}
            </select>
            </div>
            <div style={{ minWidth: 220 }}>
              <FieldLabel text="Код трансформатора" />
            <input style={styles.input} placeholder="Код (T-...)" value={trForm.code} onChange={(e) => setTrForm({ ...trForm, code: e.target.value })} />
            </div>
            <div style={{ minWidth: 220 }}>
              <FieldLabel text="Назва трансформатора" />
            <input style={styles.input} placeholder="Назва" value={trForm.name} onChange={(e) => setTrForm({ ...trForm, name: e.target.value })} />
            </div>
            <button style={styles.button} onClick={() => submit(createTransformer, { ...trForm, substation_id: Number(trForm.substation_id), rated_power_kva: Number(trForm.rated_power_kva), voltage_in_kv: Number(trForm.voltage_in_kv), voltage_out_kv: Number(trForm.voltage_out_kv) })}>Додати</button>
          </div>
          <DataTable columns={["ID", "ПС", "Код", "Назва", "кВА"]} rows={filteredTransformers.map((t) => [t.id, subCodeById[t.substation_id] ?? t.substation_id, t.code, t.name, t.rated_power_kva ?? "-"])} />
        </div>
        <div style={styles.card}>
          <h3>Лінії</h3>
          <div style={styles.toolbar}>
            <div style={{ minWidth: 220 }}>
              <FieldLabel text="Трансформатор" />
            <select style={styles.input} value={lineForm.transformer_id} onChange={(e) => setLineForm({ ...lineForm, transformer_id: e.target.value })}>
              {filteredTransformers.map((t) => <option key={t.id} value={t.id}>{t.code} - {t.name}</option>)}
            </select>
            </div>
            <div style={{ minWidth: 220 }}>
              <FieldLabel text="Код лінії" />
            <input style={styles.input} placeholder="Код (L-...)" value={lineForm.code} onChange={(e) => setLineForm({ ...lineForm, code: e.target.value })} />
            </div>
            <div style={{ minWidth: 220 }}>
              <FieldLabel text="Назва лінії" />
            <input style={styles.input} placeholder="Назва" value={lineForm.name} onChange={(e) => setLineForm({ ...lineForm, name: e.target.value })} />
            </div>
            <button style={styles.button} onClick={() => submit(createLine, { ...lineForm, transformer_id: Number(lineForm.transformer_id), voltage_kv: Number(lineForm.voltage_kv) })}>Додати</button>
          </div>
          <DataTable columns={["ID", "Трансформатор", "Код", "Назва", "кВ"]} rows={filteredLines.map((l) => [l.id, trCodeById[l.transformer_id] ?? l.transformer_id, l.code, l.name, l.voltage_kv ?? "-"])} />
        </div>
      </div>

      
    </div>
  );
}
