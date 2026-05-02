import { FieldLabel, styles } from "../ui.jsx";
import { Badge } from "./topologyCommon.jsx";

/**
 * Класичний ієрархічний перегляд топології (список / дерево).
 */
export default function TopologyTreeView({ data }) {
  if (!data?.substations?.length) {
    return (
      <div style={styles.card}>
        <p style={styles.muted}>Немає даних топології.</p>
      </div>
    );
  }

  return (
    <>
      {data.substations.map((sub) => (
        <div key={sub.id} style={{ ...styles.card, borderLeft: "4px solid #2563eb" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
            <strong>{sub.code}</strong>
            <span>{sub.name}</span>
            <Badge status={sub.status}>{sub.status}</Badge>
            <span style={styles.muted}>
              {sub.load_kw != null ? `${sub.load_kw} кВт` : "—"}
              {sub.rated_capacity_kw != null ? ` / номінал ${sub.rated_capacity_kw} кВт` : ""}
            </span>
          </div>
          {(sub.transformers || []).length === 0 ? (
            <p style={styles.muted}>Немає трансформаторів у цій підстанції.</p>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {(sub.transformers || []).map((tr) => (
                <div
                  key={tr.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 12,
                    background: "#fafafa"
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
                    <strong>{tr.code}</strong>
                    <span>{tr.name}</span>
                    <Badge status={tr.status}>{tr.status}</Badge>
                    <span style={styles.muted}>{tr.load_kw != null ? `${tr.load_kw} кВт` : "—"}</span>
                  </div>
                  {(tr.lines || []).map((line) => (
                    <div key={line.id} style={{ marginTop: 8, padding: 8, border: "1px dashed #d1d5db", borderRadius: 8 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
                        <strong>{line.code}</strong>
                        <span>{line.name}</span>
                        <Badge status={line.status}>{line.status}</Badge>
                        <span style={styles.muted}>{line.load_kw != null ? `${line.load_kw} кВт` : "—"}</span>
                      </div>
                      {(line.sites || []).length > 0 ? (
                        <div style={{ marginTop: 8 }}>
                          <FieldLabel text="Об'єкти (sites)" />
                          <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                            {(line.sites || []).map((site) => (
                              <li key={site.id}>
                                {site.name}
                                {site.enterprise_name ? ` (${site.enterprise_name})` : ""}{" "}
                                <Badge status={site.status}>{site.status}</Badge>{" "}
                                <span style={styles.muted}>{site.load_kw != null ? `${site.load_kw} кВт` : ""}</span>
                                {(site.meters || []).length > 0 ? (
                                  <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>
                                    {site.meters.map((m) => (
                                      <li key={m.id}>
                                        #{m.id} {m.serial_number} [{m.zone_name}] {m.meter_role}{" "}
                                        <Badge status={m.status}>{m.status}</Badge>{" "}
                                        <span style={styles.muted}>{m.load_kw != null ? `${m.load_kw} кВт` : ""}</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
