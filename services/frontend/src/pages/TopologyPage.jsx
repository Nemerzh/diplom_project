import { useCallback, useEffect, useState } from "react";
import { getTopologyOverview, postTopologyRecompute } from "../api";
import { FieldLabel, styles } from "../ui.jsx";

const statusStyle = {
  normal: { background: "#dcfce7", color: "#166534", border: "1px solid #86efac" },
  warning: { background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d" },
  critical: { background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" },
  offline: { background: "#f3f4f6", color: "#4b5563", border: "1px solid #d1d5db" }
};

function Badge({ status, children }) {
  const s = statusStyle[status] || statusStyle.offline;
  return (
    <span style={{ ...s, borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 600 }}>{children}</span>
  );
}

export default function TopologyPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  /** Спочатку перерахунок з показів → потім дерево. Інакше load_snapshots застарілі. */
  const load = useCallback(async (silent) => {
    setError(null);
    if (!silent) setLoading(true);
    try {
      const r = await postTopologyRecompute();
      setLastResult(r);
      const o = await getTopologyOverview();
      setData(o);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Помилка завантаження");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadOverviewOnly = useCallback(async () => {
    setError(null);
    try {
      const o = await getTopologyOverview();
      setData(o);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Помилка завантаження");
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => load(true), 30000);
    return () => clearInterval(id);
  }, [load]);

  const onRecompute = async () => {
    setRecomputing(true);
    setError(null);
    try {
      await load(true);
    } finally {
      setRecomputing(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={styles.card}>
        <h3 style={{ marginTop: 0 }}>Топологія мережі</h3>
        <p style={styles.muted}>
          Підстанція → трансформатор → лінія → об&apos;єкт (site) → лічильник. Після нових показів потрібен перерахунок агрегатів;
          ця сторінка робить його автоматично при відкритті, кнопці «Оновити» та кожні ~30 с.
          Вікно усереднення: {data?.window_minutes ?? "—"} хв.
        </p>
        <p style={styles.muted}>
          Лічильники симулятора (<code>METER_IDS</code>) мають існувати в БД і бути прив&apos;язані до site+line — інакше навантаження лишиться 0.
        </p>
        <div style={styles.toolbar}>
          <button style={styles.button} type="button" onClick={onRecompute} disabled={recomputing}>
            {recomputing ? "Оновлення…" : "Оновити зараз (перерахунок + дерево)"}
          </button>
          <button style={styles.buttonSecondary} type="button" onClick={() => loadOverviewOnly()}>
            Лише перегляд (GET overview, без перерахунку)
          </button>
          {lastResult ? (
            <span style={styles.muted}>
              snapshots: {lastResult.snapshots_written}, alerts: {lastResult.alerts_created}
            </span>
          ) : null}
        </div>
        {error ? <p style={{ color: "#b91c1c", marginBottom: 0 }}>{String(error)}</p> : null}
      </div>

      {loading && !data ? (
        <div style={styles.card}>Завантаження…</div>
      ) : null}

      {data?.substations?.map((sub) => (
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
    </div>
  );
}
