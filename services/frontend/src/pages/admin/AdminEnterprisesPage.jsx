import { useEffect, useState } from "react";
import { createEnterprise, deleteEnterprise, getEnterprises, updateEnterprise } from "../../api";
import { DataTable, FieldError, FieldLabel, Toasts, styles } from "../../ui.jsx";

export default function AdminEnterprisesPage() {
  const [enterprises, setEnterprises] = useState([]);
  const [form, setForm] = useState({ name: "" });
  const [editingId, setEditingId] = useState(null);
  const [errors, setErrors] = useState({});
  const [toasts, setToasts] = useState([]);

  const pushToast = (text, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2500);
  };

  const load = async () => {
    const enterprisesData = await getEnterprises();
    setEnterprises(enterprisesData);
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setEditingId(null);
    setErrors({});
    setForm((prev) => ({ ...prev, name: "" }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = "Вкажи назву підприємства.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const payload = { city_id: null, name: form.name.trim() };
    try {
      if (editingId) {
        await updateEnterprise(editingId, payload);
        pushToast("Підприємство оновлено.");
      } else {
        await createEnterprise(payload);
        pushToast("Підприємство створено.");
      }
      resetForm();
      await load();
    } catch (err) {
      pushToast(err?.response?.data?.detail || "Помилка збереження підприємства.", "error");
    }
  };

  const beginEdit = (enterprise) => {
    setEditingId(enterprise.id);
    setForm({
      name: enterprise.name || ""
    });
  };

  const remove = async (enterpriseId) => {
    if (!window.confirm("Видалити підприємство?")) return;
    try {
      await deleteEnterprise(enterpriseId);
      pushToast("Підприємство видалено.");
      await load();
    } catch (err) {
      pushToast(err?.response?.data?.detail || "Не вдалося видалити підприємство.", "error");
    }
  };

  return (
    <div style={styles.grid2}>
      <Toasts items={toasts} />
      <div style={styles.card}>
        <h3>{editingId ? `Редагувати підприємство #${editingId}` : "Створити підприємство"}</h3>
        <form onSubmit={submit}>
          <p>
            <FieldLabel text="Назва підприємства" />
            <input
              style={{ ...styles.input, ...(errors.name ? styles.inputError : {}) }}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Назва підприємства"
            />
            <FieldError text={errors.name} />
          </p>
          <div style={styles.toolbar}>
            <button style={styles.button} type="submit">{editingId ? "Оновити" : "Створити"}</button>
            {editingId ? <button style={styles.buttonSecondary} type="button" onClick={resetForm}>Скасувати</button> : null}
          </div>
        </form>
      </div>
      <div style={styles.card}>
        <h3>Підприємства</h3>
        <div style={styles.toolbar}><button style={styles.buttonSecondary} type="button" onClick={load}>Оновити</button></div>
        <DataTable
          columns={["ID", "Підприємство", "Дії"]}
          rows={enterprises.map((e) => [
            e.id,
            e.name,
            <div key={e.id} style={styles.actionGroup}>
              <button style={styles.buttonSecondary} onClick={() => beginEdit(e)}>Редагувати</button>
              <button style={styles.buttonSecondary} onClick={() => remove(e.id)}>Видалити</button>
            </div>
          ])}
        />
      </div>
    </div>
  );
}
