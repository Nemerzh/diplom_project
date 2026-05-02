import { useCallback, useEffect, useMemo, useState } from "react";
import { getTopologyOverview, postTopologyRecompute } from "../api";
import TopologyGraphView from "../topology/TopologyGraphView.jsx";
import TopologyTreeView from "../topology/TopologyTreeView.jsx";
import { collectEnterprisesFromTopology, pruneTopologyBySiteEnterprise } from "../topology/topologyFilter.js";
import { FieldLabel, styles } from "../ui.jsx";

const VIEW_STORAGE_KEY = "topology_view_mode";
const GRAPH_ENT_STORAGE_KEY = "topology_graph_enterprise_id";

export default function TopologyPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [viewMode, setViewMode] = useState(() => {
    try {
      const v = localStorage.getItem(VIEW_STORAGE_KEY);
      return v === "graph" ? "graph" : "tree";
    } catch {
      return "tree";
    }
  });

  /** Фільтр графа за підприємством (об'єкти site); "" = усі. */
  const [graphEnterpriseId, setGraphEnterpriseId] = useState(() => {
    try {
      return localStorage.getItem(GRAPH_ENT_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
    } catch {
      // ignore
    }
  }, [viewMode]);

  useEffect(() => {
    try {
      localStorage.setItem(GRAPH_ENT_STORAGE_KEY, graphEnterpriseId);
    } catch {
      // ignore
    }
  }, [graphEnterpriseId]);

  const graphEnterprises = useMemo(() => collectEnterprisesFromTopology(data?.substations), [data]);

  const graphSubstations = useMemo(
    () => pruneTopologyBySiteEnterprise(data?.substations, graphEnterpriseId),
    [data, graphEnterpriseId]
  );

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
        <div style={{ ...styles.toolbar, flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <button style={styles.button} type="button" onClick={onRecompute} disabled={recomputing}>
            {recomputing ? "Оновлення…" : "Оновити зараз (перерахунок + дерево)"}
          </button>
          <button style={styles.buttonSecondary} type="button" onClick={() => loadOverviewOnly()}>
            Лише перегляд (GET overview, без перерахунку)
          </button>
          <span style={styles.muted}>Вигляд:</span>
          <button
            type="button"
            style={viewMode === "tree" ? styles.button : styles.buttonSecondary}
            onClick={() => setViewMode("tree")}
          >
            Дерево (список)
          </button>
          <button
            type="button"
            style={viewMode === "graph" ? styles.button : styles.buttonSecondary}
            onClick={() => setViewMode("graph")}
          >
            Граф (схема)
          </button>
          {lastResult ? (
            <span style={styles.muted}>
              snapshots: {lastResult.snapshots_written}, alerts: {lastResult.alerts_created}
            </span>
          ) : null}
        </div>
        {viewMode === "graph" ? (
          <p style={{ ...styles.muted, marginBottom: 0 }}>
            У режимі графа можна масштабувати та пересувати полотно (pan/zoom). Вузли лише для перегляду.
          </p>
        ) : null}
        {viewMode === "graph" && data ? (
          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
            <div style={{ minWidth: 220 }}>
              <FieldLabel text="Підприємство на схемі" />
              <select
                style={{ ...styles.input, maxWidth: 360 }}
                value={graphEnterpriseId}
                onChange={(e) => setGraphEnterpriseId(e.target.value)}
              >
                <option value="">Усі підприємства (повна схема)</option>
                {graphEnterprises.map((e) => (
                  <option key={e.id} value={String(e.id)}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <p style={{ ...styles.muted, margin: 0, flex: "1 1 240px" }}>
              За вибором одного підприємства залишаються лише гілки ПС → … → об&apos;єкти (site), що належать цьому
              підприємству; порожні лінії прибираються.
            </p>
          </div>
        ) : null}
        {error ? <p style={{ color: "#b91c1c", marginBottom: 0 }}>{String(error)}</p> : null}
      </div>

      {loading && !data ? (
        <div style={styles.card}>Завантаження…</div>
      ) : null}

      {data && viewMode === "tree" ? <TopologyTreeView data={data} /> : null}
      {data && viewMode === "graph" && graphEnterpriseId && graphSubstations.length === 0 ? (
        <div style={styles.card}>
          <p style={{ margin: 0, color: "#64748b" }}>
            Для обраного підприємства немає об&apos;єктів у топології (або вони не прив&apos;язані до ліній). Оберіть
            «Усі підприємства» або перевірте дані в адмін-панелі.
          </p>
        </div>
      ) : null}
      {data && viewMode === "graph" && !(graphEnterpriseId && graphSubstations.length === 0) ? (
        <TopologyGraphView substations={graphSubstations} />
      ) : null}
    </div>
  );
}
