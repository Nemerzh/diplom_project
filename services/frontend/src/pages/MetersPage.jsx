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

const ROLE_LABELS = {
  workshop_zone: "Зона цеху",
  equipment: "Обладнання",
  submeter: "Підлічильник"
};

const STATUS_STYLES = {
  active: { bg: "#dcfce7", color: "#166534", border: "#86efac", label: "Активний" },
  inactive: { bg: "#f3f4f6", color: "#4b5563", border: "#d1d5db", label: "Неактивний" },
  maintenance: { bg: "#fef9c3", color: "#854d0e", border: "#fde047", label: "Обслуговування" }
};

const METER_TYPE_UA = {
  electricity: "Електроенергія",
  gas: "Газ",
  water: "Вода",
  heat: "Тепло"
};

function fmtDt(iso) {
  return formatDateTime(iso);
}

function norm(s) {
  return String(s ?? "").toLowerCase();
}

export default function MetersPage() {
  const [meters, setMeters] = useState([]);
  const [sites, setSites] = useState([]);
  const [enterprises, setEnterprises] = useState([]);
  const [lines, setLines] = useState([]);
  const [transformers, setTransformers] = useState([]);
  const [substations, setSubstations] = useState([]);
  const [query, setQuery] = useState("");
  const [enterpriseFilter, setEnterpriseFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const load = async () => {
    const [metersData, sitesData, entData, linesData, trData, subData] = await Promise.all([
      getMeters(),
      getSites(),
      getEnterprises(),
      getLines(),
      getTransformers(),
      getSubstations()
    ]);
    setMeters(metersData);
    setSites(sitesData);
    setEnterprises(entData);
    setLines(linesData);
    setTransformers(trData);
    setSubstations(subData);
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const maps = useMemo(() => {
    const enterpriseById = Object.fromEntries(enterprises.map((e) => [e.id, e]));
    const siteById = Object.fromEntries(sites.map((s) => [s.id, s]));
    const lineById = Object.fromEntries(lines.map((l) => [l.id, l]));
    const trById = Object.fromEntries(transformers.map((t) => [t.id, t]));
    const subById = Object.fromEntries(substations.map((s) => [s.id, s]));
    return { enterpriseById, siteById, lineById, trById, subById };
  }, [enterprises, sites, lines, transformers, substations]);

  const enriched = useMemo(() => {
    const { enterpriseById, siteById, lineById, trById, subById } = maps;
    return meters.map((m) => {
      const site = siteById[m.site_id];
      const ent = site ? enterpriseById[site.enterprise_id] : null;
      const line = lineById[m.line_id];
      const tr = line ? trById[line.transformer_id] : null;
      const sub = tr ? subById[tr.substation_id] : null;
      const lineLabel = line ? `${line.code} — ${line.name}` : String(m.line_id ?? "—");
      return {
        raw: m,
        enterpriseName: ent?.name ?? "—",
        siteName: site?.name ?? String(m.site_id),
        siteLocation: site?.location || "",
        lineLabel,
        substationName: sub?.name ?? "—",
        roleUa: ROLE_LABELS[m.meter_role] ?? m.meter_role,
        typeUa: METER_TYPE_UA[m.meter_type] ?? m.meter_type,
        statusStyle: STATUS_STYLES[m.status] ?? STATUS_STYLES.inactive
      };
    });
  }, [meters, maps]);

  const filtered = useMemo(() => {
    const ef = enterpriseFilter ? Number(enterpriseFilter) : null;
    return enriched.filter((row) => {
      const m = row.raw;
      if (ef != null && ef !== "") {
        const site = maps.siteById[m.site_id];
        if (!site || Number(site.enterprise_id) !== ef) return false;
      }
      if (statusFilter && m.status !== statusFilter) return false;
      if (!query.trim()) return true;
      const q = norm(query);
      const hay = [
        m.serial_number,
        m.zone_name,
        m.meter_role,
        m.meter_type,
        m.status,
        row.enterpriseName,
        row.siteName,
        row.siteLocation,
        row.lineLabel,
        row.substationName,
        String(m.id)
      ]
        .map(norm)
        .join(" ");
      return hay.includes(q);
    });
  }, [enriched, query, enterpriseFilter, statusFilter, maps]);

  const counts = useMemo(() => {
    const active = meters.filter((m) => m.status === "active").length;
    return { total: meters.length, active };
  }, [meters]);

  return (
    <div style={styles.page}>
    <div style={styles.card}>
      <h3 style={styles.cardTitle}>Лічильники</h3>
      <p style={styles.muted}>
        Реєстр лічильників у контексті підприємства, об&apos;єкта та електричної топології (підстанція → лінія). Редагування — у
        Адмін панелі.
      </p>

      <div style={{ ...styles.grid4, marginBottom: 12 }}>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, background: "#fafafa" }}>
          <div style={styles.muted}>Усього</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{counts.total}</div>
        </div>
        <div style={{ border: "1px solid #dcfce7", borderRadius: 8, padding: 12, background: "#f0fdf4" }}>
          <div style={{ ...styles.muted, color: "#166534" }}>Активні</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#166534" }}>{counts.active}</div>
        </div>
      </div>

      <div style={styles.toolbarEnd}>
        <button type="button" style={styles.buttonSecondary} onClick={() => load()}>
          Оновити
        </button>
        <div style={{ flex: "1 1 200px", minWidth: 200 }}>
          <FieldLabel text="Пошук" />
          <input
            style={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Серійний номер, зона, об'єкт, лінія, підстанція, ID…"
          />
        </div>
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
        <div style={{ minWidth: 160 }}>
          <FieldLabel text="Статус" />
          <select style={styles.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Усі</option>
            <option value="active">Активний</option>
            <option value="inactive">Неактивний</option>
            <option value="maintenance">Обслуговування</option>
          </select>
        </div>
      </div>

      <div style={styles.tableWrap}>
        <table style={{ ...styles.table, minWidth: 1100 }}>
          <thead>
            <tr>
              <th style={styles.thtd}>ID</th>
              <th style={styles.thtd}>Серійний номер</th>
              <th style={styles.thtd}>Підприємство</th>
              <th style={styles.thtd}>Об&apos;єкт</th>
              <th style={styles.thtd}>Топологія</th>
              <th style={styles.thtd}>Зона / роль</th>
              <th style={styles.thtd}>Тип</th>
              <th style={styles.thtd}>Статус</th>
              <th style={styles.thtd}>Зв&apos;язок</th>
              <th style={styles.thtd}>Створено</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} style={styles.thtd}>
                  <span style={styles.muted}>Нічого не знайдено за поточними фільтрами.</span>
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const m = row.raw;
                const st = row.statusStyle;
                return (
                  <tr key={m.id}>
                    <td style={styles.thtd}>{m.id}</td>
                    <td style={styles.thtd}>
                      <div style={{ fontWeight: 600 }}>{m.serial_number}</div>
                      {m.is_main_meter ? (
                        <div style={{ fontSize: 12, color: "#1d4ed8", marginTop: 2 }}>Головний лічильник</div>
                      ) : null}
                    </td>
                    <td style={styles.thtd}>{row.enterpriseName}</td>
                    <td style={styles.thtd}>
                      <div>{row.siteName}</div>
                      {row.siteLocation ? <div style={{ ...styles.muted, fontSize: 12 }}>{row.siteLocation}</div> : null}
                    </td>
                    <td style={styles.thtd}>
                      <div style={{ fontSize: 13 }}>{row.substationName}</div>
                      <div style={{ ...styles.muted, fontSize: 12 }}>{row.lineLabel}</div>
                    </td>
                    <td style={styles.thtd}>
                      <div>{m.zone_name}</div>
                      <div style={{ ...styles.muted, fontSize: 12 }}>{row.roleUa}</div>
                    </td>
                    <td style={styles.thtd}>{row.typeUa}</td>
                    <td style={styles.thtd}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          background: st.bg,
                          color: st.color,
                          border: `1px solid ${st.border}`
                        }}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td style={styles.thtd}>{fmtDt(m.last_seen_at)}</td>
                    <td style={styles.thtd}>{fmtDt(m.created_at)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p style={{ ...styles.muted, marginTop: 10, marginBottom: 0 }}>
        Показано {filtered.length} з {meters.length} лічильників.
      </p>
    </div>
    </div>
  );
}
