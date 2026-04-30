import { useEffect, useState } from "react";
import { createSite, deleteSite, getEnterprises, getLines, getSites, updateSite } from "../../api";
import { DataTable, FieldError, FieldLabel, Toasts, styles } from "../../ui.jsx";

export default function AdminSitesPage() {
  const [sites, setSites] = useState([]);
  const [allEnterprises, setAllEnterprises] = useState([]);
  const [form, setForm] = useState({ enterprise_id: "", name: "", location: "", line_id: "" });
  const [lineOptions, setLineOptions] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [errors, setErrors] = useState({});
  const [toasts, setToasts] = useState([]);

  const pushToast = (text, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2500);
  };

  const load = async () => {
    const s = await getSites();
    const allE = await getEnterprises();
    setSites(s);
    setAllEnterprises(allE);
    setForm((prev) => {
      const next = { ...prev };
      const validEnterprise = allE.some((ent) => String(ent.id) === String(next.enterprise_id));
      if (!validEnterprise) next.enterprise_id = allE[0] ? String(allE[0].id) : "";
      return next;
    });
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!form.enterprise_id) {
      setLineOptions([]);
      return;
    }
    (async () => {
      try {
        const lines = await getLines({ enterprise_id: Number(form.enterprise_id) });
        setLineOptions(lines);
      } catch {
        setLineOptions([]);
      }
    })();
  }, [form.enterprise_id]);

  const resetForm = () => {
    setEditingId(null);
    setErrors({});
    setForm((prev) => ({ ...prev, enterprise_id: "", name: "", location: "", line_id: "" }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const nextErrors = {};
    if (!form.enterprise_id) nextErrors.enterprise_id = "Обери підприємство.";
    if (!form.name.trim()) nextErrors.name = "Вкажи назву.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    try {
      const payload = {
        enterprise_id: Number(form.enterprise_id),
        name: form.name.trim(),
        location: form.location.trim(),
        line_id: form.line_id ? Number(form.line_id) : null
      };
      if (editingId) {
        await updateSite(editingId, payload);
        pushToast("Об'єкт оновлено.");
      } else {
        await createSite(payload);
        pushToast("Об'єкт створено.");
      }
      resetForm();
      await load();
    } catch (err) {
      pushToast(err?.response?.data?.detail || "Помилка збереження об'єкта.", "error");
    }
  };

  const beginEdit = (site) => {
    setEditingId(site.id);
    setForm({
      enterprise_id: String(site.enterprise_id),
      name: site.name || "",
      location: site.location || "",
      line_id: site.line_id != null ? String(site.line_id) : ""
    });
  };

  const remove = async (siteId) => {
    if (!window.confirm("Видалити об'єкт?")) return;
    try {
      await deleteSite(siteId);
      pushToast("Об'єкт видалено.");
      await load();
    } catch (err) {
      pushToast(err?.response?.data?.detail || "Не вдалося видалити об'єкт.", "error");
    }
  };

  const enterpriseNameById = Object.fromEntries(allEnterprises.map((e) => [e.id, e.name]));
  return (
    <div style={styles.grid2}>
      <Toasts items={toasts} />
      <div style={styles.card}>
        <h3>{editingId ? `Редагувати об'єкт #${editingId}` : "Створити об'єкт"}</h3>
        <form onSubmit={submit}>
          <p>
            <FieldLabel text="Підприємство" />
            <select style={{ ...styles.input, ...(errors.enterprise_id ? styles.inputError : {}) }} value={form.enterprise_id} onChange={(e) => setForm({ ...form, enterprise_id: e.target.value })}>
              <option value="">Оберіть підприємство</option>
              {allEnterprises.map((ent) => <option key={ent.id} value={ent.id}>{ent.name}</option>)}
            </select>
            <FieldError text={errors.enterprise_id} />
          </p>
          <p>
            <FieldLabel text="Назва об'єкта (Site)" />
            <input style={{ ...styles.input, ...(errors.name ? styles.inputError : {}) }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Назва об'єкта" />
            <FieldError text={errors.name} />
          </p>
          <p>
            <FieldLabel text="Локація" />
            <input style={styles.input} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Локація" />
          </p>
          <p>
            <FieldLabel text="Лінія живлення (опційно)" />
            <select
              style={styles.input}
              value={form.line_id}
              onChange={(e) => setForm({ ...form, line_id: e.target.value })}
              disabled={!form.enterprise_id || lineOptions.length === 0}
            >
              <option value="">Без прив&apos;язки до лінії</option>
              {lineOptions.map((ln) => (
                <option key={ln.id} value={ln.id}>{ln.code} — {ln.name}</option>
              ))}
            </select>
            <span style={styles.muted}> Лінії підприємства для топології та агрегації навантаження.</span>
          </p>
          <div style={styles.toolbar}>
            <button style={styles.button} type="submit">{editingId ? "Оновити" : "Створити"}</button>
            {editingId ? <button style={styles.buttonSecondary} type="button" onClick={resetForm}>Скасувати</button> : null}
          </div>
        </form>
      </div>
      <div style={styles.card}>
        <h3>Об'єкти</h3>
        <DataTable
          columns={["ID", "Підприємство", "Назва", "Лінія", "Локація", "Дії"]}
          rows={sites.map((s) => [
            s.id,
            enterpriseNameById[s.enterprise_id] ?? s.enterprise_id,
            s.name,
            s.line_id ?? "—",
            s.location,
            <div key={s.id} style={styles.actionGroup}>
              <button style={styles.buttonSecondary} onClick={() => beginEdit(s)}>Редагувати</button>
              <button style={styles.buttonSecondary} onClick={() => remove(s.id)}>Видалити</button>
            </div>
          ])}
        />
      </div>
    </div>
  );
}
