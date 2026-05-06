import { useEffect, useMemo, useState } from "react";
import {
  getEnterprises,
  getLines,
  getMeters,
  getSites,
  getSubstations,
  getTransformers
} from "../api";
import { FieldLabel, styles } from "../ui.jsx";
import { formatDateTime } from "../utils/datetime.js";

const PAGE_SIZES = [20, 25, 30];

function fmtDt(iso) {
  return formatDateTime(iso);
}

function norm(s) {
  return String(s ?? "").toLowerCase();
}

export default function SitesPage() {
  const [sites, setSites] = useState([]);
  const [enterprises, setEnterprises] = useState([]);
  const [lines, setLines] = useState([]);
  const [transformers, setTransformers] = useState([]);
  const [substations, setSubstations] = useState([]);
  const [meters, setMeters] = useState([]);
  const [enterpriseFilter, setEnterpriseFilter] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const load = async () => {
    const [sitesData, entData, linesData, trData, subData, metersData] = await Promise.all([
      getSites(),
      getEnterprises(),
      getLines(),
      getTransformers(),
      getSubstations(),
      getMeters()
    ]);
    setSites(sitesData);
    setEnterprises(entData);
    setLines(linesData);
    setTransformers(trData);
    setSubstations(subData);
    setMeters(metersData);
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
  }, [enterpriseFilter, query, pageSize]);

  const enterpriseById = useMemo(() => Object.fromEntries(enterprises.map((e) => [e.id, e])), [enterprises]);
  const lineById = useMemo(() => Object.fromEntries(lines.map((l) => [l.id, l])), [lines]);
  const trById = useMemo(() => Object.fromEntries(transformers.map((t) => [t.id, t])), [transformers]);
  const subById = useMemo(() => Object.fromEntries(substations.map((s) => [s.id, s])), [substations]);

  const metersBySiteId = useMemo(() => {
    const m = {};
    for (const meter of meters) {
      if (!m[meter.site_id]) m[meter.site_id] = [];
      m[meter.site_id].push(meter);
    }
    return m;
  }, [meters]);

  const enriched = useMemo(() => {
    return sites.map((s) => {
      const ent = enterpriseById[s.enterprise_id];
      const siteMeters = metersBySiteId[s.id] || [];
      const active = siteMeters.filter((x) => String(x.status).toLowerCase() === "active").length;
      const line = s.line_id ? lineById[s.line_id] : null;
      const tr = line ? trById[line.transformer_id] : null;
      const sub = tr ? subById[tr.substation_id] : null;
      const lineLabel = line ? `${line.code} — ${line.name}` : "—";
      return {
        raw: s,
        enterpriseName: ent?.name ?? String(s.enterprise_id),
        lineLabel,
        substationName: sub?.name ?? "—",
        transformerLabel: tr ? `${tr.code} — ${tr.name}` : "—",
        metersTotal: siteMeters.length,
        metersActive: active
      };
    });
  }, [sites, enterpriseById, metersBySiteId, lineById, trById, subById]);

  const filtered = useMemo(() => {
    return enriched.filter((row) => {
      const s = row.raw;
      if (enterpriseFilter && String(s.enterprise_id) !== enterpriseFilter) return false;
      if (!query.trim()) return true;
      const q = norm(query);
      const hay = norm(
        [
          s.id,
          s.name,
          s.location,
          row.enterpriseName,
          row.lineLabel,
          row.substationName,
          row.transformerLabel
        ].join(" ")
      );
      return hay.includes(q);
    });
  }, [enriched, enterpriseFilter, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize) || 1);
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageSlice = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const totals = useMemo(() => {
    let mCount = 0;
    let mActive = 0;
    for (const row of filtered) {
      mCount += row.metersTotal;
      mActive += row.metersActive;
    }
    return { sites: filtered.length, meters: mCount, metersActive: mActive };
  }, [filtered]);

  return (
    <div style={styles.page}>
    <div style={styles.card}>
      <h3 style={styles.cardTitle}>Об&apos;єкти обліку</h3>
      <p style={styles.muted}>
        Об&apos;єкти (sites) у складі підприємства та прив&apos;язці до лінії електромережі. CRUD — у Адмін панелі.
      </p>

      <div style={{ ...styles.grid4, marginBottom: 12 }}>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, background: "#fafafa" }}>
          <div style={styles.muted}>Об&apos;єктів у вибірці</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{totals.sites}</div>
        </div>
        <div style={{ border: "1px solid #dbeafe", borderRadius: 8, padding: 12, background: "#eff6ff" }}>
          <div style={{ ...styles.muted, color: "#1e40af" }}>Лічильників (усього / активних)</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1e3a8a" }}>
            {totals.meters} / {totals.metersActive}
          </div>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, background: "#fafafa" }}>
          <div style={styles.muted}>У базі об&apos;єктів</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{sites.length}</div>
        </div>
      </div>

      <div style={styles.toolbarEnd}>
        <button type="button" style={styles.buttonSecondary} onClick={() => load()}>
          Оновити
        </button>
        <div style={{ minWidth: 200 }}>
          <FieldLabel text="Підприємство" />
          <select style={styles.select} value={enterpriseFilter} onChange={(e) => setEnterpriseFilter(e.target.value)}>
            <option value="">Усі</option>
            {enterprises.map((e) => (
              <option key={e.id} value={String(e.id)}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: "1 1 220px", minWidth: 200 }}>
          <FieldLabel text="Пошук" />
          <input
            style={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Назва, локація, лінія, підстанція…"
          />
        </div>
      </div>

      <div style={styles.paginationBar}>
        <span style={{ ...styles.muted, fontSize: 13 }}>
          {filtered.length === 0
            ? "Немає записів у вибірці"
            : `Показано ${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filtered.length)} з ${filtered.length}`}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ ...styles.muted, fontSize: 13 }}>На сторінці</span>
          <select
            style={{ ...styles.select, maxWidth: 88 }}
            value={String(pageSize)}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
          </select>
          <button type="button" style={styles.buttonSecondary} disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
            Назад
          </button>
          <span style={{ fontSize: 14 }}>
            Сторінка {currentPage} з {totalPages}
          </span>
          <button
            type="button"
            style={styles.buttonSecondary}
            disabled={currentPage >= totalPages}
            onClick={() => setPage(currentPage + 1)}
          >
            Далі
          </button>
        </div>
      </div>

      <div style={styles.tableWrap}>
        <table style={{ ...styles.table, minWidth: 960 }}>
          <thead>
            <tr>
              <th style={styles.thtd}>ID</th>
              <th style={styles.thtd}>Назва</th>
              <th style={styles.thtd}>Локація</th>
              <th style={styles.thtd}>Підприємство</th>
              <th style={styles.thtd}>Підстанція</th>
              <th style={styles.thtd}>Трансформатор</th>
              <th style={styles.thtd}>Лінія</th>
              <th style={styles.thtd}>Лічильники</th>
              <th style={styles.thtd}>Створено</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} style={styles.thtd}>
                  <span style={styles.muted}>Нічого не знайдено за фільтрами.</span>
                </td>
              </tr>
            ) : (
              pageSlice.map(
                ({
                  raw: s,
                  enterpriseName,
                  lineLabel,
                  substationName,
                  transformerLabel,
                  metersTotal,
                  metersActive
                }) => (
                  <tr key={s.id}>
                    <td style={styles.thtd}>{s.id}</td>
                    <td style={styles.thtd}>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                    </td>
                    <td style={styles.thtd}>{s.location || "—"}</td>
                    <td style={styles.thtd}>{enterpriseName}</td>
                    <td style={styles.thtd}>{substationName}</td>
                    <td style={{ ...styles.thtd, fontSize: 13 }}>{transformerLabel}</td>
                    <td style={{ ...styles.thtd, fontSize: 13 }}>{lineLabel}</td>
                    <td style={styles.thtd}>
                      {metersTotal === 0 ? (
                        <span style={styles.muted}>0</span>
                      ) : (
                        <>
                          <strong>{metersTotal}</strong>
                          <span style={{ ...styles.muted, fontSize: 12 }}> ({metersActive} активн.)</span>
                        </>
                      )}
                    </td>
                    <td style={styles.thtd}>{fmtDt(s.created_at)}</td>
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
    </div>
  );
}
