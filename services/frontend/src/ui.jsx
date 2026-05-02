export const styles = {
  app: { fontFamily: "Arial, sans-serif", background: "#f6f7fb", minHeight: "100vh", display: "flex", flexDirection: "column" },
  container: { maxWidth: 1400, margin: "0 auto", padding: "0 20px", width: "100%", boxSizing: "border-box" },
  content: { flex: 1, padding: "16px 0 24px 0", width: "100%", minWidth: 0, boxSizing: "border-box" },
  header: {
    position: "static",
    zIndex: 1,
    background: "#ffffff",
    borderBottom: "1px solid #d7dbe7",
    padding: "14px 0"
  },
  /** Шапка: заголовок над навігацією — навігація не «їде» вбік на вузьких екранах */
  headerStack: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: 14,
    width: "100%"
  },
  headerCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap"
  },
  title: { margin: 0, fontSize: 22, lineHeight: 1.25 },
  nav: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 0, justifyContent: "flex-start" },
  link: {
    padding: "8px 12px",
    border: "1px solid #d7dbe7",
    borderRadius: 8,
    textDecoration: "none",
    color: "#1f2937",
    background: "#fff",
    fontSize: 14,
    lineHeight: 1.2,
    boxSizing: "border-box"
  },
  card: { border: "1px solid #d7dbe7", borderRadius: 10, padding: 16, background: "#fff", minWidth: 0, overflow: "hidden" },
  /** Вертикальний ритм сторінки оператора / адміна */
  page: { width: "100%", minWidth: 0, display: "flex", flexDirection: "column", gap: 16, boxSizing: "border-box" },
  pageTitle: { margin: "0 0 6px 0", fontSize: 20, fontWeight: 700, lineHeight: 1.3 },
  cardTitle: { margin: "0 0 10px 0", fontSize: 17, fontWeight: 700, lineHeight: 1.3 },
  grid4: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
    gap: 12,
    alignItems: "stretch"
  },
  grid3: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
    gap: 12,
    alignItems: "start"
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
    gap: 16,
    alignItems: "start"
  },
  input: {
    width: "100%",
    maxWidth: "100%",
    padding: "8px 10px",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    fontSize: 14,
    boxSizing: "border-box",
    minWidth: 0
  },
  select: {
    width: "100%",
    maxWidth: "100%",
    padding: "8px 10px",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    fontSize: 14,
    boxSizing: "border-box",
    minWidth: 0,
    cursor: "pointer",
    background: "#fff"
  },
  inputError: { border: "1px solid #dc2626" },
  button: { padding: "8px 12px", borderRadius: 8, border: "1px solid #1d4ed8", background: "#2563eb", color: "#fff", cursor: "pointer" },
  buttonSecondary: { padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", color: "#111827", cursor: "pointer" },
  actionGroup: { display: "flex", gap: 6, flexWrap: "wrap", minWidth: 180 },
  toolbar: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 },
  toolbarEnd: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 },
  muted: { color: "#6b7280", fontSize: 13 },
  tableWrap: { overflowX: "auto", width: "100%", minWidth: 0, WebkitOverflowScrolling: "touch" },
  table: { width: "100%", borderCollapse: "collapse", marginTop: 10, minWidth: 0 },
  /** Панель пагінації під таблицями */
  paginationBar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
    padding: "10px 12px",
    background: "#f8fafc",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    boxSizing: "border-box",
    minWidth: 0
  },
  thtd: { borderBottom: "1px solid #e5e7eb", padding: 8, textAlign: "left", fontSize: 14, verticalAlign: "top", whiteSpace: "normal", overflowWrap: "anywhere" },
  fieldLabel: { display: "block", fontSize: 13, color: "#374151", marginBottom: 6, fontWeight: 600 },
  errorText: { color: "#b91c1c", fontSize: 12, marginTop: 4 },
  toastWrap: { position: "fixed", right: 16, top: 16, display: "grid", gap: 8, zIndex: 1000 },
  toast: { borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 14 },
  toastSuccess: { background: "#16a34a" },
  toastError: { background: "#dc2626" },
  footer: { borderTop: "1px solid #d7dbe7", background: "#fff", marginTop: "auto" },
  footerInner: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 0" },
  footerText: { color: "#6b7280", fontSize: 13, margin: 0 }
};

export function DataTable({ columns, rows, tableStyle }) {
  return (
    <div style={styles.tableWrap}>
      <table style={{ ...styles.table, ...tableStyle }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} style={styles.thtd}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx}>
              {r.map((v, i) => (
                <td key={i} style={styles.thtd}>{typeof v === "string" || typeof v === "number" ? String(v) : (v ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FieldError({ text }) {
  if (!text) return null;
  return <div style={styles.errorText}>{text}</div>;
}

export function FieldLabel({ text }) {
  return <label style={styles.fieldLabel}>{text}</label>;
}

export function Toasts({ items }) {
  if (!items?.length) return null;
  return (
    <div style={styles.toastWrap}>
      {items.map((t) => (
        <div key={t.id} style={{ ...styles.toast, ...(t.type === "success" ? styles.toastSuccess : styles.toastError) }}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function AppFooter({ variant = "operator" }) {
  const roleLabel = variant === "admin" ? "Режим: Адміністратор" : "Режим: Оператор";
  return (
    <footer style={styles.footer}>
      <div style={styles.container}>
        <div style={styles.footerInner}>
          <p style={styles.footerText}>Energy Metering Platform</p>
          <p style={styles.footerText}>{roleLabel}</p>
        </div>
      </div>
    </footer>
  );
}
