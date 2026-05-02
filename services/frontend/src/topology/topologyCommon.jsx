export const statusStyle = {
  normal: { background: "#dcfce7", color: "#166534", border: "1px solid #86efac" },
  warning: { background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d" },
  critical: { background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" },
  offline: { background: "#f3f4f6", color: "#4b5563", border: "1px solid #d1d5db" }
};

export function Badge({ status, children }) {
  const s = statusStyle[status] || statusStyle.offline;
  return (
    <span style={{ ...s, borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 600 }}>{children}</span>
  );
}
