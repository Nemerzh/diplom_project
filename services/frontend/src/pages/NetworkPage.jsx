import { useEffect, useMemo, useState } from "react";
import {
  getEnterprises,
  getLines,
  getSites,
  getSubstations,
  getTransformers
} from "../api";
import { FieldLabel, styles } from "../ui.jsx";

const PAGE_SIZES = [20, 25, 30];

function norm(s) {
  return String(s ?? "").toLowerCase();
}

function fmtNum(v) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "—";
}

const NODE_STATUS_UA = {
  normal: "Норма",
  warning: "Увага",
  critical: "Критично",
  overloaded: "Перевантаження",
  offline: "Офлайн"
};

function nodeBadge(status) {
  const key = String(status || "").toLowerCase();
  const label = NODE_STATUS_UA[key] ?? status ?? "—";
  const palette = {
    normal: { bg: "#dcfce7", color: "#166534", border: "#86efac" },
    warning: { bg: "#fef9c3", color: "#854d0e", border: "#fde047" },
    critical: { bg: "#fecaca", color: "#991b1b", border: "#f87171" },
    overloaded: { bg: "#ffedd5", color: "#9a3412", border: "#fdba74" },
    offline: { bg: "#f3f4f6", color: "#4b5563", border: "#d1d5db" }
  };
  const st = palette[key] || palette.normal;
  return (
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
      {label}
    </span>
  );
}

function PaginationBar({
  label,
  page,
  setPage,
  pageSize,
  setPageSize,
  total,
  currentPage,
  totalPages,
  sliceLen
}) {
  const from = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = total === 0 ? 0 : Math.min(currentPage * pageSize, total);
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        marginBottom: 8,
        padding: "8px 10px",
        background: "#f8fafc",
        borderRadius: 8,
        border: "1px solid #e2e8f0"
      }}
    >
      <span style={{ ...styles.muted, fontSize: 13 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ ...styles.muted, fontSize: 13 }}>На сторінці</span>
        <select
          style={{ ...styles.input, maxWidth: 88, padding: "4px 8px" }}
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
          {total === 0 ? "немає записів" : `${from}–${to} з ${total}`}
        </span>
        <button type="button" style={styles.buttonSecondary} disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
          Назад
        </button>
        <span style={{ fontSize: 13 }}>{currentPage} / {totalPages}</span>
        <button
          type="button"
          style={styles.buttonSecondary}
          disabled={currentPage >= totalPages}
          onClick={() => setPage(currentPage + 1)}
        >
          Далі
        </button>
      </div>
      <span style={{ ...styles.muted, fontSize: 12 }}>На екрані: {sliceLen}</span>
    </div>
  );
}

export default function NetworkPage() {
  const [enterprises, setEnterprises] = useState([]);
  const [substations, setSubstations] = useState([]);
  const [transformers, setTransformers] = useState([]);
  const [lines, setLines] = useState([]);
  const [sites, setSites] = useState([]);
  const [enterpriseFilter, setEnterpriseFilter] = useState("");
  const [substationFilter, setSubstationFilter] = useState("");
  const [query, setQuery] = useState("");
  const [pageSub, setPageSub] = useState(1);
  const [pageTr, setPageTr] = useState(1);
  const [pageLn, setPageLn] = useState(1);
  const [pageSizeSub, setPageSizeSub] = useState(25);
  const [pageSizeTr, setPageSizeTr] = useState(25);
  const [pageSizeLn, setPageSizeLn] = useState(25);

  const load = async () => {
    const [ent, s, t, l, sitesData] = await Promise.all([
      getEnterprises(),
      getSubstations(),
      getTransformers(),
      getLines(),
      getSites()
    ]);
    setEnterprises(ent);
    setSubstations(s);
    setTransformers(t);
    setLines(l);
    setSites(sitesData);
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  useEffect(() => {
    setPageSub(1);
    setPageTr(1);
    setPageLn(1);
  }, [enterpriseFilter, substationFilter, query]);

  useEffect(() => {
    setPageSub(1);
  }, [pageSizeSub]);

  useEffect(() => {
    setPageTr(1);
  }, [pageSizeTr]);

  useEffect(() => {
    setPageLn(1);
  }, [pageSizeLn]);

  const enterpriseById = useMemo(() => Object.fromEntries(enterprises.map((e) => [e.id, e])), [enterprises]);
  const substationById = useMemo(() => Object.fromEntries(substations.map((s) => [s.id, s])), [substations]);
  const transformerById = useMemo(() => Object.fromEntries(transformers.map((t) => [t.id, t])), [transformers]);

  const substationsInScope = useMemo(() => {
    let list = substations;
    if (enterpriseFilter) list = list.filter((x) => String(x.enterprise_id) === enterpriseFilter);
    if (substationFilter) list = list.filter((x) => String(x.id) === substationFilter);
    return list;
  }, [substations, enterpriseFilter, substationFilter]);

  const transformersInScope = useMemo(() => {
    const ids = new Set(substationsInScope.map((s) => s.id));
    return transformers.filter((t) => ids.has(t.substation_id));
  }, [transformers, substationsInScope]);

  const linesInScope = useMemo(() => {
    const tids = new Set(transformersInScope.map((t) => t.id));
    return lines.filter((ln) => tids.has(ln.transformer_id));
  }, [lines, transformersInScope]);

  const substationsScoped = useMemo(() => {
    if (!query.trim()) return substationsInScope;
    const q = norm(query);
    return substationsInScope.filter((x) => {
      const ent = enterpriseById[x.enterprise_id];
      const hay = norm([x.id, x.code, x.name, ent?.name].join(" "));
      return hay.includes(q);
    });
  }, [substationsInScope, query, enterpriseById]);

  const transformersScoped = useMemo(() => {
    if (!query.trim()) return transformersInScope;
    const q = norm(query);
    return transformersInScope.filter((t) => {
      const sub = substationById[t.substation_id];
      const hay = norm([t.id, t.code, t.name, sub?.code, sub?.name].join(" "));
      return hay.includes(q);
    });
  }, [transformersInScope, query, substationById]);

  const linesScoped = useMemo(() => {
    if (!query.trim()) return linesInScope;
    const q = norm(query);
    return linesInScope.filter((ln) => {
      const tr = transformerById[ln.transformer_id];
      const sub = tr ? substationById[tr.substation_id] : null;
      const hay = norm([ln.id, ln.code, ln.name, tr?.code, tr?.name, sub?.code].join(" "));
      return hay.includes(q);
    });
  }, [linesInScope, query, transformerById, substationById]);

  const sitesOnLinesCount = useMemo(() => {
    const lid = new Set(linesInScope.map((l) => l.id));
    return sites.filter((si) => si.line_id != null && lid.has(si.line_id)).length;
  }, [sites, linesInScope]);

  const paginate = (arr, page, size) => {
    const tp = Math.max(1, Math.ceil(arr.length / size) || 1);
    const cp = Math.min(Math.max(1, page), tp);
    const start = (cp - 1) * size;
    return { slice: arr.slice(start, start + size), totalPages: tp, currentPage: cp };
  };

  const subP = useMemo(() => paginate(substationsScoped, pageSub, pageSizeSub), [substationsScoped, pageSub, pageSizeSub]);
  const trP = useMemo(() => paginate(transformersScoped, pageTr, pageSizeTr), [transformersScoped, pageTr, pageSizeTr]);
  const lnP = useMemo(() => paginate(linesScoped, pageLn, pageSizeLn), [linesScoped, pageLn, pageSizeLn]);

  const substationsForSelect = useMemo(() => {
    let list = substations;
    if (enterpriseFilter) list = list.filter((s) => String(s.enterprise_id) === enterpriseFilter);
    return list;
  }, [substations, enterpriseFilter]);

  const onEnterpriseChange = (v) => {
    setEnterpriseFilter(v);
    setSubstationFilter("");
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={styles.card}>
        <h3 style={{ marginTop: 0 }}>Електромережа</h3>
        <p style={styles.muted}>
          Структура: підприємство → підстанція → трансформатор → лінія → об&apos;єкти обліку. Дані лише для перегляду; редагування — у
          Адмін панелі (мережа).
        </p>
        <div style={{ ...styles.toolbar, alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
          <button type="button" style={styles.buttonSecondary} onClick={() => load()}>
            Оновити
          </button>
          <div style={{ minWidth: 200 }}>
            <FieldLabel text="Підприємство" />
            <select style={styles.input} value={enterpriseFilter} onChange={(e) => onEnterpriseChange(e.target.value)}>
              <option value="">Усі</option>
              {enterprises.map((e) => (
                <option key={e.id} value={String(e.id)}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 240 }}>
            <FieldLabel text="Підстанція" />
            <select style={styles.input} value={substationFilter} onChange={(e) => setSubstationFilter(e.target.value)}>
              <option value="">Усі (за обраним підприємством)</option>
              {substationsForSelect.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: "1 1 220px", minWidth: 200 }}>
            <FieldLabel text="Пошук по таблицях" />
            <input
              style={styles.input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Код, назва, ID…"
            />
            <p style={{ ...styles.muted, marginTop: 6, marginBottom: 0 }}>
              KPI зверху — по області підприємство / підстанція; пошук лише звужує рядки в таблицях нижче.
            </p>
          </div>
        </div>
      </div>

      <div style={styles.grid4}>
        <div style={{ ...styles.card, borderLeft: "4px solid #2563eb" }}>
          <div style={styles.muted}>Підстанцій (за фільтром)</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{substationsInScope.length}</div>
        </div>
        <div style={{ ...styles.card, borderLeft: "4px solid #7c3aed" }}>
          <div style={styles.muted}>Трансформаторів</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{transformersInScope.length}</div>
        </div>
        <div style={{ ...styles.card, borderLeft: "4px solid #059669" }}>
          <div style={styles.muted}>Ліній</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{linesInScope.length}</div>
        </div>
        <div style={{ ...styles.card, borderLeft: "4px solid #d97706" }}>
          <div style={styles.muted}>Об&apos;єктів на цих лініях</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{sitesOnLinesCount}</div>
        </div>
      </div>

      <div style={styles.card}>
        <h3 style={{ marginTop: 0 }}>Підстанції</h3>
        <PaginationBar
          label="Підстанції"
          page={pageSub}
          setPage={setPageSub}
          pageSize={pageSizeSub}
          setPageSize={setPageSizeSub}
          total={substationsScoped.length}
          currentPage={subP.currentPage}
          totalPages={subP.totalPages}
          sliceLen={subP.slice.length}
        />
        <div style={styles.tableWrap}>
          <table style={{ ...styles.table, minWidth: 920 }}>
            <thead>
              <tr>
                <th style={styles.thtd}>ID</th>
                <th style={styles.thtd}>Код</th>
                <th style={styles.thtd}>Назва</th>
                <th style={styles.thtd}>Підприємство</th>
                <th style={styles.thtd}>кВ in → out</th>
                <th style={styles.thtd}>Номінал кВт</th>
                <th style={styles.thtd}>Поріг увага / критично</th>
                <th style={styles.thtd}>Вузол</th>
              </tr>
            </thead>
            <tbody>
              {subP.slice.length === 0 ? (
                <tr>
                  <td colSpan={8} style={styles.thtd}>
                    <span style={styles.muted}>Немає записів.</span>
                  </td>
                </tr>
              ) : (
                subP.slice.map((x) => (
                  <tr key={x.id}>
                    <td style={styles.thtd}>{x.id}</td>
                    <td style={styles.thtd}>
                      <code style={{ fontSize: 13 }}>{x.code}</code>
                    </td>
                    <td style={styles.thtd}>{x.name}</td>
                    <td style={styles.thtd}>{enterpriseById[x.enterprise_id]?.name ?? x.enterprise_id}</td>
                    <td style={styles.thtd}>
                      {fmtNum(x.voltage_in_kv)} → {fmtNum(x.voltage_out_kv)}
                    </td>
                    <td style={styles.thtd}>{fmtNum(x.rated_capacity_kw)}</td>
                    <td style={styles.thtd}>
                      {fmtNum(x.threshold_warning_kw)} / {fmtNum(x.threshold_critical_kw)}
                    </td>
                    <td style={styles.thtd}>{nodeBadge(x.node_status)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={styles.card}>
        <h3 style={{ marginTop: 0 }}>Трансформатори</h3>
        <PaginationBar
          label="Трансформатори"
          page={pageTr}
          setPage={setPageTr}
          pageSize={pageSizeTr}
          setPageSize={setPageSizeTr}
          total={transformersScoped.length}
          currentPage={trP.currentPage}
          totalPages={trP.totalPages}
          sliceLen={trP.slice.length}
        />
        <div style={styles.tableWrap}>
          <table style={{ ...styles.table, minWidth: 880 }}>
            <thead>
              <tr>
                <th style={styles.thtd}>ID</th>
                <th style={styles.thtd}>Підстанція</th>
                <th style={styles.thtd}>Код</th>
                <th style={styles.thtd}>Назва</th>
                <th style={styles.thtd}>кВА</th>
                <th style={styles.thtd}>кВ in → out</th>
                <th style={styles.thtd}>Статус</th>
              </tr>
            </thead>
            <tbody>
              {trP.slice.length === 0 ? (
                <tr>
                  <td colSpan={7} style={styles.thtd}>
                    <span style={styles.muted}>Немає записів.</span>
                  </td>
                </tr>
              ) : (
                trP.slice.map((t) => {
                  const sub = substationById[t.substation_id];
                  return (
                    <tr key={t.id}>
                      <td style={styles.thtd}>{t.id}</td>
                      <td style={styles.thtd}>
                        <div style={{ fontSize: 13 }}>{sub ? `${sub.code} — ${sub.name}` : t.substation_id}</div>
                      </td>
                      <td style={styles.thtd}>
                        <code style={{ fontSize: 13 }}>{t.code}</code>
                      </td>
                      <td style={styles.thtd}>{t.name}</td>
                      <td style={styles.thtd}>{fmtNum(t.rated_power_kva)}</td>
                      <td style={styles.thtd}>
                        {fmtNum(t.voltage_in_kv)} → {fmtNum(t.voltage_out_kv)}
                      </td>
                      <td style={styles.thtd}>{t.status}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={styles.card}>
        <h3 style={{ marginTop: 0 }}>Лінії електропередачі</h3>
        <PaginationBar
          label="Лінії"
          page={pageLn}
          setPage={setPageLn}
          pageSize={pageSizeLn}
          setPageSize={setPageSizeLn}
          total={linesScoped.length}
          currentPage={lnP.currentPage}
          totalPages={lnP.totalPages}
          sliceLen={lnP.slice.length}
        />
        <div style={styles.tableWrap}>
          <table style={{ ...styles.table, minWidth: 980 }}>
            <thead>
              <tr>
                <th style={styles.thtd}>ID</th>
                <th style={styles.thtd}>Трансформатор</th>
                <th style={styles.thtd}>Підстанція</th>
                <th style={styles.thtd}>Код лінії</th>
                <th style={styles.thtd}>Назва</th>
                <th style={styles.thtd}>кВ</th>
                <th style={styles.thtd}>Поріг увага / критично</th>
                <th style={styles.thtd}>Лінія</th>
                <th style={styles.thtd}>Вузол</th>
              </tr>
            </thead>
            <tbody>
              {lnP.slice.length === 0 ? (
                <tr>
                  <td colSpan={9} style={styles.thtd}>
                    <span style={styles.muted}>Немає записів.</span>
                  </td>
                </tr>
              ) : (
                lnP.slice.map((ln) => {
                  const tr = transformerById[ln.transformer_id];
                  const sub = tr ? substationById[tr.substation_id] : null;
                  return (
                    <tr key={ln.id}>
                      <td style={styles.thtd}>{ln.id}</td>
                      <td style={styles.thtd}>
                        {tr ? (
                          <>
                            <div style={{ fontWeight: 600 }}>{tr.code}</div>
                            <div style={{ ...styles.muted, fontSize: 12 }}>{tr.name}</div>
                          </>
                        ) : (
                          ln.transformer_id
                        )}
                      </td>
                      <td style={styles.thtd}>{sub ? `${sub.code} — ${sub.name}` : "—"}</td>
                      <td style={styles.thtd}>
                        <code style={{ fontSize: 13 }}>{ln.code}</code>
                      </td>
                      <td style={styles.thtd}>{ln.name}</td>
                      <td style={styles.thtd}>{fmtNum(ln.voltage_kv)}</td>
                      <td style={styles.thtd}>
                        {fmtNum(ln.threshold_warning_kw)} / {fmtNum(ln.threshold_critical_kw)}
                      </td>
                      <td style={styles.thtd}>{ln.status}</td>
                      <td style={styles.thtd}>{nodeBadge(ln.node_status)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
