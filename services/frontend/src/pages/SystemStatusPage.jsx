import { useCallback, useEffect, useMemo, useState } from "react";
import { getHealth, getMeters, getReady, getSites, getValidationIssues, runValidation } from "../api";
import { FieldLabel, Toasts, styles } from "../ui.jsx";

const ISSUES_LIMIT = 1200;
const PAGE_SIZES = [20, 25, 30];

const ISSUE_CODE_UA = {
  negative_value: "Від'ємне значення кВт·год",
  gap_detected: "Розрив між показами > 30 хв",
  spike_detected: "Різкий стрибок споживання (> ×5 до попереднього)"
};

const FLAG_VARIANT = {
  BAD: { bg: "#fecaca", color: "#991b1b", border: "#f87171", label: "Критично" },
  WARN: { bg: "#fef9c3", color: "#854d0e", border: "#fde047", label: "Попередження" }
};

function fmtDt(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? String(iso)
      : d.toLocaleString("uk-UA", { dateStyle: "short", timeStyle: "medium" });
  } catch {
    return String(iso);
  }
}

function norm(s) {
  return String(s ?? "").toLowerCase();
}

export default function SystemStatusPage() {
  const [health, setHealth] = useState(null);
  const [ready, setReady] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [latencyMs, setLatencyMs] = useState(null);
  const [issues, setIssues] = useState([]);
  const [meters, setMeters] = useState([]);
  const [sites, setSites] = useState([]);
  const [query, setQuery] = useState("");
  const [flagFilter, setFlagFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [validating, setValidating] = useState(false);
  const [toasts, setToasts] = useState([]);

  const pushToast = (text, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2800);
  };

  const load = useCallback(async () => {
    setLoadError(null);
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    try {
      const [h, r, iss, m, s] = await Promise.all([
        getHealth(),
        getReady(),
        getValidationIssues(ISSUES_LIMIT),
        getMeters(),
        getSites()
      ]);
      setHealth(h);
      setReady(r);
      setIssues(iss);
      setMeters(m);
      setSites(s);
      if (t0) setLatencyMs(Math.round(performance.now() - t0));
    } catch (e) {
      setLoadError(e?.response?.data?.detail || e?.message || "Помилка з'єднання з API");
      setHealth(null);
      setReady(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [query, flagFilter, pageSize]);

  const meterById = useMemo(() => Object.fromEntries(meters.map((m) => [m.id, m])), [meters]);
  const siteById = useMemo(() => Object.fromEntries(sites.map((s) => [s.id, s])), [sites]);

  const enrichedIssues = useMemo(() => {
    return issues.map((i) => {
      const m = meterById[i.meter_id];
      const site = m ? siteById[m.site_id] : null;
      return {
        raw: i,
        serial: m?.serial_number ?? `ID ${i.meter_id}`,
        siteName: site?.name ?? "—",
        issueUa: ISSUE_CODE_UA[i.issue] ?? i.issue ?? "—",
        flagStyle: FLAG_VARIANT[i.quality_flag] ?? FLAG_VARIANT.WARN
      };
    });
  }, [issues, meterById, siteById]);

  const countsByFlag = useMemo(() => {
    let bad = 0;
    let warn = 0;
    for (const i of issues) {
      if (i.quality_flag === "BAD") bad += 1;
      else if (i.quality_flag === "WARN") warn += 1;
    }
    return { bad, warn, total: issues.length };
  }, [issues]);

  const filtered = useMemo(() => {
    return enrichedIssues.filter((row) => {
      if (flagFilter && row.raw.quality_flag !== flagFilter) return false;
      if (!query.trim()) return true;
      const q = norm(query);
      const hay = norm(
        [row.raw.id, row.raw.meter_id, row.serial, row.siteName, row.raw.quality_flag, row.issueUa, row.raw.issue].join(" ")
      );
      return hay.includes(q);
    });
  }, [enrichedIssues, query, flagFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize) || 1);
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageSlice = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const onRunValidation = async () => {
    setValidating(true);
    try {
      const res = await runValidation();
      await load();
      pushToast(`Валідацію виконано. Додано перевірених записів: ${res.validated_inserted ?? 0}.`, "success");
    } catch (e) {
      pushToast(e?.response?.data?.detail || "Не вдалося запустити валідацію.", "error");
    } finally {
      setValidating(false);
    }
  };

  const apiOk = health?.status && ready?.status;
  const dbOk = ready?.status === "готово";

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Toasts items={toasts} />

      <div style={styles.card}>
        <h3 style={{ marginTop: 0 }}>Стан системи</h3>
        <p style={styles.muted}>
          Перевірка доступності API та з&apos;єднання з базою, моніторинг проблем якості даних після валідації показів.
        </p>
        <div style={{ ...styles.toolbar, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" style={styles.buttonSecondary} onClick={() => load()}>
            Оновити
          </button>
          <button type="button" style={styles.button} disabled={validating} onClick={onRunValidation}>
            {validating ? "Валідація…" : "Запустити валідацію"}
          </button>
          {latencyMs != null ? (
            <span style={styles.muted}>Час відповіді пакету: {latencyMs} мс</span>
          ) : null}
        </div>
        {loadError ? (
          <p style={{ color: "#b91c1c", marginTop: 10 }}>{loadError}</p>
        ) : null}
      </div>

      <div style={styles.grid4}>
        <div style={{ ...styles.card, borderLeft: apiOk ? "4px solid #22c55e" : "4px solid #dc2626" }}>
          <div style={styles.muted}>HTTP API</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{health?.status ?? "—"}</div>
        </div>
        <div style={{ ...styles.card, borderLeft: dbOk ? "4px solid #22c55e" : "4px solid #dc2626" }}>
          <div style={styles.muted}>База даних</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{ready?.status ?? "—"}</div>
        </div>
        <div style={{ ...styles.card, borderLeft: "4px solid #f59e0b" }}>
          <div style={styles.muted}>Попередження (WARN)</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{countsByFlag.warn}</div>
        </div>
        <div style={{ ...styles.card, borderLeft: "4px solid #dc2626" }}>
          <div style={styles.muted}>Критичні (BAD)</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{countsByFlag.bad}</div>
        </div>
      </div>

      <div style={styles.card}>
        <h3 style={{ marginTop: 0 }}>Проблеми валідації</h3>
        <p style={styles.muted}>
          Записи з прапорцем не OK (останні до {ISSUES_LIMIT} з БД). Після зміни показів натисніть «Запустити валідацію» на сторінці показів або тут.
        </p>

        <div style={{ ...styles.toolbar, alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
          <div style={{ flex: "1 1 200px", minWidth: 180 }}>
            <FieldLabel text="Пошук" />
            <input
              style={styles.input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ID, лічильник, об'єкт, тип проблеми…"
            />
          </div>
          <div style={{ minWidth: 160 }}>
            <FieldLabel text="Рівень" />
            <select style={styles.input} value={flagFilter} onChange={(e) => setFlagFilter(e.target.value)}>
              <option value="">Усі</option>
              <option value="WARN">Попередження</option>
              <option value="BAD">Критично</option>
            </select>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginTop: 12,
            marginBottom: 8,
            padding: "10px 12px",
            background: "#f8fafc",
            borderRadius: 8,
            border: "1px solid #e2e8f0"
          }}
        >
          <span style={{ ...styles.muted, fontSize: 13 }}>
            Усього проблем у вибірці: {filtered.length}
            {issues.length >= ISSUES_LIMIT ? ` (обмеження завантаження ${ISSUES_LIMIT})` : ""}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ ...styles.muted, fontSize: 13 }}>На сторінці</span>
            <select
              style={{ ...styles.input, maxWidth: 88 }}
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
              {filtered.length === 0 ? "0" : `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filtered.length)}`}{" "}
              з {filtered.length} · стор. {currentPage}/{totalPages}
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
          <table style={{ ...styles.table, minWidth: 880 }}>
            <thead>
              <tr>
                <th style={styles.thtd}>ID</th>
                <th style={styles.thtd}>Рівень</th>
                <th style={styles.thtd}>Час показу</th>
                <th style={styles.thtd}>Лічильник</th>
                <th style={styles.thtd}>Об&apos;єкт</th>
                <th style={styles.thtd}>Опис</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={styles.thtd}>
                    <span style={styles.muted}>
                      {issues.length === 0
                        ? "Проблем валідації не знайдено (або ще не запускали валідацію)."
                        : "Нічого не відповідає фільтрам."}
                    </span>
                  </td>
                </tr>
              ) : (
                pageSlice.map(({ raw: i, serial, siteName, issueUa, flagStyle }) => (
                  <tr key={i.id}>
                    <td style={styles.thtd}>{i.id}</td>
                    <td style={styles.thtd}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          background: flagStyle.bg,
                          color: flagStyle.color,
                          border: `1px solid ${flagStyle.border}`
                        }}
                      >
                        {flagStyle.label}
                      </span>
                    </td>
                    <td style={styles.thtd}>{fmtDt(i.ts)}</td>
                    <td style={styles.thtd}>
                      <div style={{ fontWeight: 600 }}>{serial}</div>
                      <div style={{ ...styles.muted, fontSize: 12 }}>meter_id {i.meter_id}</div>
                    </td>
                    <td style={styles.thtd}>{siteName}</td>
                    <td style={styles.thtd}>{issueUa}</td>
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
