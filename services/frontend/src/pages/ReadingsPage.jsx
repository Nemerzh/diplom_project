import { useEffect, useMemo, useState } from "react";
import {
  createReading,
  getEnterprises,
  getLines,
  getMeters,
  getReadings,
  getSites,
  getSubstations,
  getTransformers,
  runValidation
} from "../api";
import { FieldError, FieldLabel, Toasts, styles } from "../ui.jsx";

const READINGS_LIMIT = 800;
const PAGE_SIZES = [20, 25, 30];

function fmtDt(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString("uk-UA", { dateStyle: "short", timeStyle: "medium" });
  } catch {
    return String(iso);
  }
}

function norm(s) {
  return String(s ?? "").toLowerCase();
}

export default function ReadingsPage() {
  const [rows, setRows] = useState([]);
  const [sites, setSites] = useState([]);
  const [meters, setMeters] = useState([]);
  const [enterprises, setEnterprises] = useState([]);
  const [lines, setLines] = useState([]);
  const [transformers, setTransformers] = useState([]);
  const [substations, setSubstations] = useState([]);
  const [form, setForm] = useState({ site_id: "", meter_id: "", value_kwh: "", source: "ui" });
  const [query, setQuery] = useState("");
  const [enterpriseFilter, setEnterpriseFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [meterFilter, setMeterFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [errors, setErrors] = useState({});
  const [toasts, setToasts] = useState([]);

  const pushToast = (text, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2500);
  };

  const load = async () => {
    const [rowsData, metersData, sitesData, entData, linesData, trData, subData] = await Promise.all([
      getReadings(READINGS_LIMIT),
      getMeters(),
      getSites(),
      getEnterprises(),
      getLines(),
      getTransformers(),
      getSubstations()
    ]);
    setRows(rowsData);
    setMeters(metersData);
    setSites(sitesData);
    setEnterprises(entData);
    setLines(linesData);
    setTransformers(trData);
    setSubstations(subData);
    setForm((prev) => {
      const siteId = prev.site_id || (sitesData[0] ? String(sitesData[0].id) : "");
      const filtered = metersData.filter((m) => String(m.site_id) === String(siteId));
      const meterId = filtered.some((m) => String(m.id) === String(prev.meter_id))
        ? prev.meter_id
        : (filtered[0] ? String(filtered[0].id) : "");
      return { ...prev, site_id: siteId, meter_id: meterId };
    });
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      load().catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  useEffect(() => {
    setPage(1);
  }, [query, enterpriseFilter, siteFilter, meterFilter, sourceFilter, pageSize]);

  const maps = useMemo(() => {
    const enterpriseById = Object.fromEntries(enterprises.map((e) => [e.id, e]));
    const siteById = Object.fromEntries(sites.map((s) => [s.id, s]));
    const meterById = Object.fromEntries(meters.map((m) => [m.id, m]));
    const lineById = Object.fromEntries(lines.map((l) => [l.id, l]));
    const trById = Object.fromEntries(transformers.map((t) => [t.id, t]));
    const subById = Object.fromEntries(substations.map((s) => [s.id, s]));
    return { enterpriseById, siteById, meterById, lineById, trById, subById };
  }, [enterprises, sites, meters, lines, transformers, substations]);

  const enrichedRows = useMemo(() => {
    const { enterpriseById, siteById, meterById, lineById, trById, subById } = maps;
    return rows.map((r) => {
      const m = meterById[r.meter_id];
      const site = m ? siteById[m.site_id] : null;
      const ent = site ? enterpriseById[site.enterprise_id] : null;
      const line = m ? lineById[m.line_id] : null;
      const tr = line ? trById[line.transformer_id] : null;
      const sub = tr ? subById[tr.substation_id] : null;
      const lineLabel = line ? `${line.code} — ${line.name}` : m ? String(m.line_id) : "—";
      return {
        raw: r,
        serial: m?.serial_number ?? `#${r.meter_id}`,
        zone: m?.zone_name ?? "—",
        siteName: site?.name ?? "—",
        siteLoc: site?.location ?? "",
        enterpriseName: ent?.name ?? "—",
        substationName: sub?.name ?? "—",
        lineLabel
      };
    });
  }, [rows, maps]);

  const sourceOptions = useMemo(() => {
    const s = new Set(rows.map((r) => r.source).filter(Boolean));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const ef = enterpriseFilter ? Number(enterpriseFilter) : null;
    const sf = siteFilter ? Number(siteFilter) : null;
    const mf = meterFilter ? Number(meterFilter) : null;
    return enrichedRows.filter((row) => {
      const m = maps.meterById[row.raw.meter_id];
      const site = m ? maps.siteById[m.site_id] : null;
      if (ef != null && (!site || Number(site.enterprise_id) !== ef)) return false;
      if (sf != null && (!m || Number(m.site_id) !== sf)) return false;
      if (mf != null && Number(row.raw.meter_id) !== mf) return false;
      if (sourceFilter && row.raw.source !== sourceFilter) return false;
      if (!query.trim()) return true;
      const q = norm(query);
      const hay = norm(
        [
          row.raw.id,
          row.raw.meter_id,
          row.raw.source,
          row.raw.value_kwh,
          row.serial,
          row.zone,
          row.siteName,
          row.enterpriseName,
          row.substationName,
          row.lineLabel,
          row.siteLoc
        ].join(" ")
      );
      return hay.includes(q);
    });
  }, [enrichedRows, query, enterpriseFilter, siteFilter, meterFilter, sourceFilter, maps]);

  const stats = useMemo(() => {
    let sum = 0;
    for (const row of filtered) sum += Number(row.raw.value_kwh) || 0;
    return { count: filtered.length, sumKwh: sum };
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize) || 1);
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const filteredMeters = meters.filter((m) => String(m.site_id) === String(form.site_id));
  const sitesForFilter = useMemo(() => {
    if (!enterpriseFilter) return sites;
    return sites.filter((s) => String(s.enterprise_id) === String(enterpriseFilter));
  }, [sites, enterpriseFilter]);

  const metersForFilter = useMemo(() => {
    let list = meters;
    if (enterpriseFilter) {
      const sids = new Set(sitesForFilter.map((s) => s.id));
      list = list.filter((m) => sids.has(m.site_id));
    }
    if (siteFilter) list = list.filter((m) => String(m.site_id) === String(siteFilter));
    return list;
  }, [meters, enterpriseFilter, siteFilter, sitesForFilter]);

  const onEnterpriseFilter = (v) => {
    setEnterpriseFilter(v);
    setSiteFilter("");
    setMeterFilter("");
  };

  const onSiteFilter = (v) => {
    setSiteFilter(v);
    setMeterFilter("");
  };

  const submit = async (e) => {
    e.preventDefault();
    const nextErrors = {};
    if (!form.site_id) nextErrors.site_id = "Обери об'єкт.";
    if (!form.meter_id) nextErrors.meter_id = "Обери лічильник.";
    if (!form.value_kwh || Number(form.value_kwh) <= 0) nextErrors.value_kwh = "Вкажи додатнє значення кВт·год.";
    if (!form.source.trim()) nextErrors.source = "Вкажи джерело.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      await createReading({
        meter_id: Number(form.meter_id),
        value_kwh: Number(form.value_kwh),
        source: form.source.trim(),
        ts: new Date().toISOString()
      });
      setForm({ ...form, value_kwh: "" });
      await load();
      pushToast("Показ успішно збережено.", "success");
    } catch (err) {
      pushToast(err?.response?.data?.detail || "Не вдалося зберегти показ.", "error");
    }
  };

  return (
    <div style={styles.grid2}>
      <Toasts items={toasts} />
      <div style={styles.card}>
        <h3>Додати показ</h3>
        <form onSubmit={submit}>
          <p>
            <FieldLabel text="Об'єкт" />
            <select
              style={{ ...styles.input, ...(errors.site_id ? styles.inputError : {}) }}
              value={form.site_id}
              onChange={(e) => {
                const nextSiteId = e.target.value;
                const firstMeter = meters.find((m) => String(m.site_id) === String(nextSiteId));
                setForm({ ...form, site_id: nextSiteId, meter_id: firstMeter ? String(firstMeter.id) : "" });
              }}
              required
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (ID {s.id})
                </option>
              ))}
            </select>
            <FieldError text={errors.site_id} />
          </p>
          <p>
            <FieldLabel text="Лічильник" />
            <select
              style={{ ...styles.input, ...(errors.meter_id ? styles.inputError : {}) }}
              value={form.meter_id}
              onChange={(e) => setForm({ ...form, meter_id: e.target.value })}
              required
            >
              {filteredMeters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.serial_number} · {m.zone_name}
                </option>
              ))}
            </select>
            <FieldError text={errors.meter_id} />
          </p>
          <p>
            <FieldLabel text="Значення, кВт·год" />
            <input
              style={{ ...styles.input, ...(errors.value_kwh ? styles.inputError : {}) }}
              value={form.value_kwh}
              onChange={(e) => setForm({ ...form, value_kwh: e.target.value })}
              placeholder="кВт·год"
              required
            />
            <FieldError text={errors.value_kwh} />
          </p>
          <p>
            <FieldLabel text="Джерело даних" />
            <input
              style={{ ...styles.input, ...(errors.source ? styles.inputError : {}) }}
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              placeholder="Напр. ui, api, simulator"
            />
            <FieldError text={errors.source} />
          </p>
          <button style={styles.button} type="submit">
            Зберегти показ
          </button>
        </form>
        <p style={{ marginTop: 10 }}>
          <button
            style={styles.button}
            onClick={async () => {
              try {
                await runValidation();
                await load();
                pushToast("Валідацію виконано.", "success");
              } catch {
                pushToast("Не вдалося виконати валідацію.", "error");
              }
            }}
            type="button"
          >
            Запустити валідацію
          </button>
        </p>
      </div>

      <div style={styles.card}>
        <h3 style={{ marginTop: 0 }}>Останні покази</h3>
        <p style={styles.muted}>
          Завантажується до {READINGS_LIMIT} останніх записів з урахуванням часу показу (не часу збереження в БД).
        </p>

        <div style={{ ...styles.grid4, marginBottom: 12 }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, background: "#fafafa" }}>
            <div style={styles.muted}>У вибірці (рядків)</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.count}</div>
          </div>
          <div style={{ border: "1px solid #dbeafe", borderRadius: 8, padding: 12, background: "#eff6ff" }}>
            <div style={{ ...styles.muted, color: "#1e40af" }}>Сума кВт·год (відфільтр.)</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1e3a8a" }}>{stats.sumKwh.toFixed(2)}</div>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, background: "#fafafa" }}>
            <div style={styles.muted}>У базі завантажено</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{rows.length}</div>
          </div>
        </div>

        <div style={{ ...styles.toolbar, alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
          <div style={{ flex: "1 1 200px", minWidth: 180 }}>
            <FieldLabel text="Пошук" />
            <input
              style={styles.input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ID, джерело, лічильник, об'єкт, лінія…"
            />
          </div>
          <div style={{ minWidth: 160 }}>
            <FieldLabel text="Підприємство" />
            <select style={styles.input} value={enterpriseFilter} onChange={(e) => onEnterpriseFilter(e.target.value)}>
              <option value="">Усі</option>
              {enterprises.map((e) => (
                <option key={e.id} value={String(e.id)}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 160 }}>
            <FieldLabel text="Об'єкт" />
            <select style={styles.input} value={siteFilter} onChange={(e) => onSiteFilter(e.target.value)}>
              <option value="">Усі</option>
              {sitesForFilter.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 180 }}>
            <FieldLabel text="Лічильник" />
            <select style={styles.input} value={meterFilter} onChange={(e) => setMeterFilter(e.target.value)}>
              <option value="">Усі</option>
              {metersForFilter.map((m) => (
                <option key={m.id} value={String(m.id)}>
                  {m.serial_number}
                </option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 140 }}>
            <FieldLabel text="Джерело" />
            <select style={styles.input} value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              <option value="">Усі</option>
              {sourceOptions.map((src) => (
                <option key={src} value={src}>
                  {src}
                </option>
              ))}
            </select>
          </div>
          <label style={{ ...styles.muted, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} /> Автооновлення (5 с)
          </label>
          <button type="button" style={styles.buttonSecondary} onClick={() => load()}>
            Оновити
          </button>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 10,
            padding: "10px 12px",
            background: "#f8fafc",
            borderRadius: 8,
            border: "1px solid #e2e8f0"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ ...styles.muted, fontSize: 13 }}>На сторінці</span>
            <select
              style={{ ...styles.input, maxWidth: 88, padding: "6px 8px" }}
              value={String(pageSize)}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
            <span style={{ ...styles.muted, fontSize: 13 }}>
              {filtered.length === 0
                ? "Немає записів у вибірці"
                : `Показано ${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filtered.length)} з ${filtered.length}`}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              style={styles.buttonSecondary}
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Назад
            </button>
            <span style={{ fontSize: 14, minWidth: 120, textAlign: "center" }}>
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
                <th style={styles.thtd}>Час показу</th>
                <th style={styles.thtd}>кВт·год</th>
                <th style={styles.thtd}>Джерело</th>
                <th style={styles.thtd}>Лічильник</th>
                <th style={styles.thtd}>Зона</th>
                <th style={styles.thtd}>Об&apos;єкт</th>
                <th style={styles.thtd}>Підприємство</th>
                <th style={styles.thtd}>Підстанція / лінія</th>
                <th style={styles.thtd}>Запис у БД</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} style={styles.thtd}>
                    <span style={styles.muted}>Немає рядків за фільтрами.</span>
                  </td>
                </tr>
              ) : (
                paginatedRows.map(({ raw: r, serial, zone, siteName, siteLoc, enterpriseName, substationName, lineLabel }) => (
                  <tr key={r.id}>
                    <td style={styles.thtd}>{r.id}</td>
                    <td style={styles.thtd}>{fmtDt(r.ts)}</td>
                    <td style={{ ...styles.thtd, fontWeight: 600 }}>{Number(r.value_kwh).toFixed(3)}</td>
                    <td style={styles.thtd}>
                      <code style={{ fontSize: 13 }}>{r.source}</code>
                    </td>
                    <td style={styles.thtd}>
                      <div style={{ fontWeight: 600 }}>{serial}</div>
                      <div style={{ ...styles.muted, fontSize: 12 }}>ID {r.meter_id}</div>
                    </td>
                    <td style={styles.thtd}>{zone}</td>
                    <td style={styles.thtd}>
                      <div>{siteName}</div>
                      {siteLoc ? <div style={{ ...styles.muted, fontSize: 12 }}>{siteLoc}</div> : null}
                    </td>
                    <td style={styles.thtd}>{enterpriseName}</td>
                    <td style={styles.thtd}>
                      <div style={{ fontSize: 13 }}>{substationName}</div>
                      <div style={{ ...styles.muted, fontSize: 12 }}>{lineLabel}</div>
                    </td>
                    <td style={styles.thtd}>{fmtDt(r.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
