export const styles = {
  app: { fontFamily: "Arial, sans-serif", background: "#f6f7fb", minHeight: "100vh", display: "flex", flexDirection: "column" },
  container: { maxWidth: 1400, margin: "0 auto", padding: "0 20px", width: "100%", boxSizing: "border-box" },
  content: { flex: 1, padding: "16px 0 20px 0" },
  header: {
    position: "static",
    zIndex: 1,
    background: "#ffffff",
    borderBottom: "1px solid #d7dbe7",
    padding: "12px 0"
  },
  headerCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap"
  },
  title: { margin: 0, fontSize: 22, lineHeight: 1.2 },
  nav: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 0, justifyContent: "flex-end" },
  link: { padding: "8px 12px", border: "1px solid #d7dbe7", borderRadius: 8, textDecoration: "none", color: "#1f2937", background: "#fff" },
  card: { border: "1px solid #d7dbe7", borderRadius: 10, padding: 16, background: "#fff", minWidth: 0, overflow: "hidden" },
  grid4: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 },
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 12 },
  input: { width: "100%", padding: 8, border: "1px solid #cbd5e1", borderRadius: 8 },
  inputError: { border: "1px solid #dc2626" },
  button: { padding: "8px 12px", borderRadius: 8, border: "1px solid #1d4ed8", background: "#2563eb", color: "#fff", cursor: "pointer" },
  buttonSecondary: { padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", color: "#111827", cursor: "pointer" },
  actionGroup: { display: "flex", gap: 6, flexWrap: "wrap", minWidth: 180 },
  toolbar: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 },
  muted: { color: "#6b7280", fontSize: 13 },
  tableWrap: { overflowX: "auto", width: "100%" },
  table: { width: "100%", borderCollapse: "collapse", marginTop: 10, minWidth: 760 },
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

export function DataTable({ columns, rows }) {
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
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
