import { useCallback, useEffect, useMemo, useState } from "react";
import {
  downloadLineReportCsv,
  getEnterprises,
  getLineLoadReport,
  getMeters,
  getSiteCompareOnLine,
  getSites,
  getSubstations,
  getTransformers,
  getLines,
  rebuildReports
} from "../api";
import AlertsSummaryCard from "../reports/AlertsSummaryCard.jsx";
import HierarchicalDetailsTable from "../reports/HierarchicalDetailsTable.jsx";
import LineConsumptionChart from "../reports/LineConsumptionChart.jsx";
import ReportFilters from "../reports/ReportFilters.jsx";
import ReportKpis from "../reports/ReportKpis.jsx";
import SiteComparisonPanel from "../reports/SiteComparisonPanel.jsx";
import SiteDistributionChart from "../reports/SiteDistributionChart.jsx";
import TopListsCards from "../reports/TopListsCards.jsx";
import { Toasts, styles } from "../ui.jsx";
import { formatDateTime } from "../utils/datetime.js";

function defaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function ReportsPage() {
  const { from: defFrom, to: defTo } = defaultDateRange();
  const [enterprises, setEnterprises] = useState([]);
  const [enterpriseId, setEnterpriseId] = useState("");
  const [substations, setSubstations] = useState([]);
  const [substationId, setSubstationId] = useState("");
  const [transformers, setTransformers] = useState([]);
  const [transformerId, setTransformerId] = useState("");
  const [lines, setLines] = useState([]);
  const [lineId, setLineId] = useState("");
  const [siteFilterId, setSiteFilterId] = useState("");
  const [granularity, setGranularity] = useState("daily");
  const [dateFrom, setDateFrom] = useState(defFrom);
  const [dateTo, setDateTo] = useState(defTo);
  const [meters, setMeters] = useState([]);
  const [sites, setSites] = useState([]);
  const [lineData, setLineData] = useState(null);
  const [compare, setCompare] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState([]);

  const pushToast = (text, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2800);
  };

  useEffect(() => {
    (async () => {
      try {
        const [entList, siteList, meterList] = await Promise.all([getEnterprises(), getSites(), getMeters()]);
        setEnterprises(entList);
        setSites(siteList);
        setMeters(meterList);
        if (entList.length) setEnterpriseId(String(entList[0].id));
      } catch {
        pushToast("Не вдалося завантажити довідники", "error");
      }
    })();
  }, []);

  useEffect(() => {
    if (!enterpriseId) return;
    (async () => {
      try {
        const subs = await getSubstations(Number(enterpriseId));
        setSubstations(subs);
        setSubstationId("");
        setTransformerId("");
        setLineId("");
        setLines([]);
        setTransformers([]);
      } catch {
        setSubstations([]);
      }
    })();
  }, [enterpriseId]);

  useEffect(() => {
    if (!substationId) {
      setTransformers([]);
      setTransformerId("");
      setLines([]);
      setLineId("");
      return;
    }
    (async () => {
      try {
        const trs = await getTransformers(Number(substationId));
        setTransformers(trs);
        setTransformerId("");
        setLines([]);
        setLineId("");
      } catch {
        setTransformers([]);
      }
    })();
  }, [substationId]);

  useEffect(() => {
    if (!transformerId) {
      setLines([]);
      setLineId("");
      return;
    }
    (async () => {
      try {
        const ls = await getLines({ transformer_id: Number(transformerId) });
        setLines(ls);
        setLineId("");
      } catch {
        setLines([]);
      }
    })();
  }, [transformerId]);

  const sitesOnLine = useMemo(() => {
    if (!lineId) return [];
    const sids = new Set(meters.filter((m) => String(m.line_id) === String(lineId)).map((m) => m.site_id));
    return sites.filter((s) => sids.has(s.id));
  }, [lineId, meters, sites]);

  const isoRange = useCallback(() => {
    const df = new Date(`${dateFrom}T00:00:00.000Z`).toISOString();
    const dt = new Date(`${dateTo}T23:59:59.999Z`).toISOString();
    return { df, dt };
  }, [dateFrom, dateTo]);

  const loadLineReport = useCallback(async () => {
    if (!lineId) {
      pushToast("Оберіть лінію", "error");
      return;
    }
    setLoading(true);
    setCompare(null);
    try {
      const { df, dt } = isoRange();
      const data = await getLineLoadReport({
        lineId: Number(lineId),
        dateFrom: df,
        dateTo: dt,
        granularity,
        enterpriseId: enterpriseId || undefined,
        substationId: substationId || undefined,
        transformerId: transformerId || undefined,
        siteId: siteFilterId || undefined
      });
      setLineData(data);
      pushToast("Звіт оновлено", "success");
    } catch {
      pushToast("Не вдалося сформувати звіт", "error");
      setLineData(null);
    } finally {
      setLoading(false);
    }
  }, [lineId, isoRange, granularity, enterpriseId, substationId, transformerId, siteFilterId]);

  const handleCompare = async (siteA, siteB) => {
    if (!lineId) return;
    setLoading(true);
    try {
      const { df, dt } = isoRange();
      const d = await getSiteCompareOnLine({
        lineId: Number(lineId),
        dateFrom: df,
        dateTo: dt,
        enterpriseId: enterpriseId || undefined,
        substationId: substationId || undefined,
        transformerId: transformerId || undefined,
        siteA,
        siteB
      });
      setCompare(d);
    } catch {
      pushToast("Порівняння не вдалося", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRebuild = async () => {
    try {
      await rebuildReports();
      await loadLineReport();
      pushToast("Агрегати перебудовано", "success");
    } catch {
      pushToast("Помилка перебудови", "error");
    }
  };

  const handleExportCsv = async () => {
    if (!lineId) return;
    try {
      const { df, dt } = isoRange();
      const blob = await downloadLineReportCsv({
        lineId: Number(lineId),
        dateFrom: df,
        dateTo: dt,
        granularity,
        enterpriseId: enterpriseId || undefined,
        substationId: substationId || undefined,
        transformerId: transformerId || undefined,
        siteId: siteFilterId || undefined
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `line_${lineId}_report.csv`;
      a.click();
      URL.revokeObjectURL(url);
      pushToast("CSV завантажено", "success");
    } catch {
      pushToast("Експорт CSV не вдався", "error");
    }
  };

  const handleExportPdf = () => {
    window.alert("Експорт PDF буде додано в наступній версії (зараз доступний CSV).");
  };

  const ctx = lineData?.context;

  return (
    <div style={styles.page}>
      <Toasts items={toasts} />
      <div style={styles.card}>
        <h2 style={styles.pageTitle}>Звіти: навантаження по лінії</h2>
        <p style={styles.muted}>
          Аналітичний dashboard для оператора: лінія → об’єкти → лічильники, KPI, графіки та сповіщення.
        </p>
      </div>
      <ReportFilters
        enterprises={enterprises}
        enterpriseId={enterpriseId}
        onEnterprise={(v) => {
          setEnterpriseId(v);
          setLineData(null);
        }}
        substations={substations}
        substationId={substationId}
        onSubstation={(v) => {
          setSubstationId(v);
          setLineData(null);
        }}
        transformers={transformers}
        transformerId={transformerId}
        onTransformer={(v) => {
          setTransformerId(v);
          setLineData(null);
        }}
        lines={lines}
        lineId={lineId}
        onLine={(v) => {
          setLineId(v);
          setLineData(null);
        }}
        sitesOnLine={sitesOnLine}
        siteFilterId={siteFilterId}
        onSiteFilter={setSiteFilterId}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFrom={setDateFrom}
        onDateTo={setDateTo}
        granularity={granularity}
        onGranularity={setGranularity}
        onApply={loadLineReport}
        onRebuild={handleRebuild}
        onExportCsv={handleExportCsv}
        onExportPdf={handleExportPdf}
        loading={loading}
      />
      {ctx ? (
        <div style={styles.card}>
          <h3 style={{ marginTop: 0 }}>Контекст звіту</h3>
          <p style={{ fontSize: 15, lineHeight: 1.5 }}>
            <b>{ctx.enterprise.name}</b> → <b>{ctx.substation.name}</b> → <b>{ctx.transformer.name}</b> (
            {ctx.transformer.code}) → <b>{ctx.line.name}</b> ({ctx.line.code})
          </p>
          <p style={styles.muted}>
            Період: {formatDateTime(ctx.period.date_from)} — {formatDateTime(ctx.period.date_to)}{" "}
            · Гранулярність: {ctx.granularity === "hourly" ? "погодинно" : ctx.granularity === "monthly" ? "помісячно" : "подобово"}
            {ctx.site_filter_id ? ` · Фільтр об'єкта #${ctx.site_filter_id}` : ""}
          </p>
        </div>
      ) : null}
      {lineData ? <ReportKpis kpi={lineData.kpi} context={lineData.context} /> : null}
      {lineData ? (
        <div style={styles.grid2}>
          <LineConsumptionChart timeSeries={lineData.time_series} granularity={granularity} />
          <SiteDistributionChart sitesDistribution={lineData.sites_distribution} />
        </div>
      ) : null}
      {lineData ? (
        <SiteComparisonPanel
          sitesDistribution={lineData.sites_distribution}
          onCompare={handleCompare}
          compare={compare}
          loading={loading}
        />
      ) : null}
      {lineData ? (
        <HierarchicalDetailsTable hierarchyTable={lineData.hierarchy_table} metersBySite={lineData.meters_by_site} />
      ) : null}
      {lineData ? <TopListsCards topSites={lineData.top_sites} topMeters={lineData.top_meters} /> : null}
      {lineData ? (
        <AlertsSummaryCard alerts={lineData.alerts} summaryBySeverity={lineData.alerts_summary_by_severity} />
      ) : null}
    </div>
  );
}
