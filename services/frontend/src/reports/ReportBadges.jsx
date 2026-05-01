const badgeBase = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600
};

const variants = {
  active: { ...badgeBase, background: "#dcfce7", color: "#166534" },
  ok: { ...badgeBase, background: "#dcfce7", color: "#166534" },
  warning: { ...badgeBase, background: "#ffedd5", color: "#9a3412" },
  critical: { ...badgeBase, background: "#fee2e2", color: "#991b1b" },
  offline: { ...badgeBase, background: "#f1f5f9", color: "#475569" },
  inactive: { ...badgeBase, background: "#f1f5f9", color: "#475569" },
  neutral: { ...badgeBase, background: "#e2e8f0", color: "#334155" }
};

export function StatusBadge({ label, variant = "neutral" }) {
  const style = variants[variant] || variants.neutral;
  return <span style={style}>{label}</span>;
}

export function meterStatusVariant(statusUa) {
  const s = String(statusUa || "").toLowerCase();
  if (s.includes("актив")) return "active";
  if (s.includes("обслуг")) return "warning";
  if (s.includes("неактив")) return "inactive";
  return "neutral";
}
