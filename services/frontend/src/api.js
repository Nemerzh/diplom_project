import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
  timeout: 10000
});

export const getDashboard = async () => {
  const [sites, meters, readings, alerts, daily] = await Promise.all([
    api.get("/sites"),
    api.get("/meters"),
    api.get("/readings?limit=200"),
    api.get("/alerts"),
    api.get("/reports/daily")
  ]);
  return {
    sites: sites.data,
    meters: meters.data,
    readings: readings.data,
    alerts: alerts.data,
    daily: daily.data
  };
};

export const getSites = async () => (await api.get("/sites")).data;
export const createSite = async (payload) => (await api.post("/sites", payload)).data;
export const updateSite = async (siteId, payload) => (await api.put(`/sites/${siteId}`, payload)).data;
export const deleteSite = async (siteId) => (await api.delete(`/sites/${siteId}`)).data;
export const getEnterprises = async (cityId) =>
  (await api.get(`/enterprises${cityId ? `?city_id=${cityId}` : ""}`)).data;
export const createEnterprise = async (payload) => (await api.post("/enterprises", payload)).data;
export const updateEnterprise = async (enterpriseId, payload) => (await api.put(`/enterprises/${enterpriseId}`, payload)).data;
export const deleteEnterprise = async (enterpriseId) => (await api.delete(`/enterprises/${enterpriseId}`)).data;
export const getCities = async () => (await api.get("/network/cities")).data;
export const createCity = async (payload) => (await api.post("/network/cities", payload)).data;
export const getSubstations = async (enterpriseId) =>
  (await api.get(`/network/substations${enterpriseId ? `?enterprise_id=${enterpriseId}` : ""}`)).data;
export const createSubstation = async (payload) => (await api.post("/network/substations", payload)).data;
export const getTransformers = async (substationId) =>
  (await api.get(`/network/transformers${substationId ? `?substation_id=${substationId}` : ""}`)).data;
export const createTransformer = async (payload) => (await api.post("/network/transformers", payload)).data;
/** @param {number|{ transformer_id?: number, enterprise_id?: number }|undefined} opts */
export const getLines = async (opts) => {
  if (opts == null) {
    return (await api.get("/network/lines")).data;
  }
  if (typeof opts === "number") {
    return (await api.get(`/network/lines?transformer_id=${opts}`)).data;
  }
  const q = new URLSearchParams();
  if (opts.transformer_id != null) q.set("transformer_id", String(opts.transformer_id));
  if (opts.enterprise_id != null) q.set("enterprise_id", String(opts.enterprise_id));
  const qs = q.toString();
  return (await api.get(`/network/lines${qs ? `?${qs}` : ""}`)).data;
};
export const createLine = async (payload) => (await api.post("/network/lines", payload)).data;
export const getMeters = async () => (await api.get("/meters")).data;
export const createMeter = async (payload) => (await api.post("/meters", payload)).data;
export const updateMeter = async (meterId, payload) => (await api.put(`/meters/${meterId}`, payload)).data;
export const deleteMeter = async (meterId) => (await api.delete(`/meters/${meterId}`)).data;

export const getReadings = async (limit = 200) => (await api.get(`/readings?limit=${limit}`)).data;
export const createReading = async (payload) => (await api.post("/readings", payload)).data;

export const runValidation = async () => (await api.post("/validation/run")).data;
export const getValidationIssues = async () => (await api.get("/validation/issues")).data;

export const rebuildReports = async () => (await api.post("/reports/rebuild")).data;
export const getDailyReports = async ({ fromDate, toDate, enterpriseId } = {}) => {
  const q = new URLSearchParams();
  if (fromDate) q.set("from_date", fromDate);
  if (toDate) q.set("to_date", toDate);
  if (enterpriseId != null && enterpriseId !== "") q.set("enterprise_id", String(enterpriseId));
  const qs = q.toString();
  return (await api.get(`/reports/daily${qs ? `?${qs}` : ""}`)).data;
};
export const getMonthlyReports = async ({ fromDate, toDate, enterpriseId } = {}) => {
  const q = new URLSearchParams();
  if (fromDate) q.set("from_date", fromDate);
  if (toDate) q.set("to_date", toDate);
  if (enterpriseId != null && enterpriseId !== "") q.set("enterprise_id", String(enterpriseId));
  const qs = q.toString();
  return (await api.get(`/reports/monthly${qs ? `?${qs}` : ""}`)).data;
};
export const compareSites = async (siteA, siteB, { fromDate, toDate, enterpriseId } = {}) => {
  const q = new URLSearchParams({ siteA: String(siteA), siteB: String(siteB) });
  if (fromDate) q.set("from_date", fromDate);
  if (toDate) q.set("to_date", toDate);
  if (enterpriseId != null && enterpriseId !== "") q.set("enterprise_id", String(enterpriseId));
  return (await api.get(`/reports/compare?${q.toString()}`)).data;
};
export const getReportsSummary = async (days = 30, enterpriseId) => {
  const q = new URLSearchParams({ days: String(days) });
  if (enterpriseId != null && enterpriseId !== "") q.set("enterprise_id", String(enterpriseId));
  return (await api.get(`/reports/summary?${q.toString()}`)).data;
};
export const getHierarchyReport = async ({ fromDate, toDate, enterpriseId } = {}) => {
  const q = new URLSearchParams();
  if (fromDate) q.set("from_date", fromDate);
  if (toDate) q.set("to_date", toDate);
  if (enterpriseId != null && enterpriseId !== "") q.set("enterprise_id", String(enterpriseId));
  const qs = q.toString();
  return (await api.get(`/reports/hierarchy${qs ? `?${qs}` : ""}`)).data;
};

const _lineReportParams = (p) => {
  const q = new URLSearchParams();
  q.set("line_id", String(p.lineId));
  q.set("date_from", p.dateFrom);
  q.set("date_to", p.dateTo);
  q.set("granularity", p.granularity || "daily");
  if (p.enterpriseId != null && p.enterpriseId !== "") q.set("enterprise_id", String(p.enterpriseId));
  if (p.substationId != null && p.substationId !== "") q.set("substation_id", String(p.substationId));
  if (p.transformerId != null && p.transformerId !== "") q.set("transformer_id", String(p.transformerId));
  if (p.siteId != null && p.siteId !== "") q.set("site_id", String(p.siteId));
  return q;
};

export const getLineLoadReport = async (p) => (await api.get(`/reports/line-load?${_lineReportParams(p).toString()}`)).data;

export const getSiteCompareOnLine = async (p) => {
  const q = _lineReportParams({ ...p, siteId: undefined });
  q.set("site_a", String(p.siteA));
  q.set("site_b", String(p.siteB));
  return (await api.get(`/reports/site-compare?${q.toString()}`)).data;
};

export const getTopSitesOnLine = async (p) => {
  const q = _lineReportParams(p);
  if (p.limit) q.set("limit", String(p.limit));
  return (await api.get(`/reports/top-sites?${q.toString()}`)).data;
};

export const getTopMetersOnLine = async (p) => {
  const q = _lineReportParams(p);
  if (p.limit) q.set("limit", String(p.limit));
  return (await api.get(`/reports/top-meters?${q.toString()}`)).data;
};

export const getAlertsSummaryOnLine = async (p) =>
  (await api.get(`/reports/alerts-summary?${_lineReportParams(p).toString()}`)).data;

export const downloadLineReportCsv = async (p) => {
  const res = await api.get(`/reports/line-load/export.csv?${_lineReportParams(p).toString()}`, { responseType: "blob" });
  return res.data;
};

/** @param {Record<string, string|boolean|number|undefined|null>} [params] */
const _alertsListParams = (params = {}) => {
  const q = new URLSearchParams();
  if (params.active_only !== undefined && params.active_only !== null)
    q.set("active_only", String(params.active_only));
  if (params.severity) q.set("severity", String(params.severity));
  if (params.date_from) q.set("date_from", String(params.date_from));
  if (params.date_to) q.set("date_to", String(params.date_to));
  if (params.enterprise_id != null && params.enterprise_id !== "")
    q.set("enterprise_id", String(params.enterprise_id));
  if (params.site_id != null && params.site_id !== "") q.set("site_id", String(params.site_id));
  if (params.meter_id != null && params.meter_id !== "") q.set("meter_id", String(params.meter_id));
  if (params.line_id != null && params.line_id !== "") q.set("line_id", String(params.line_id));
  if (params.limit) q.set("limit", String(params.limit));
  return q;
};

/** @param {Record<string, string|boolean|number|undefined|null>} [params] */
export const getAlerts = async (params) => {
  const q = _alertsListParams(params || {});
  const qs = q.toString();
  return (await api.get(`/alerts${qs ? `?${qs}` : ""}`)).data;
};

/** @param {Record<string, string|boolean|number|undefined|null>} [params] */
export const getAlertsSummary = async (params) => {
  const q = _alertsListParams(params || {});
  q.delete("severity");
  q.delete("site_id");
  q.delete("meter_id");
  q.delete("line_id");
  q.delete("limit");
  const qs = q.toString();
  return (await api.get(`/alerts/summary${qs ? `?${qs}` : ""}`)).data;
};

export const resolveAlert = async (alertId) => (await api.post(`/alerts/${alertId}/resolve`)).data;

export const createAlertRule = async (payload) => (await api.post("/alerts/rules", payload)).data;
export const getAlertRules = async () => (await api.get("/alerts/rules")).data;
export const updateAlertRule = async (ruleId, payload) => (await api.put(`/alerts/rules/${ruleId}`, payload)).data;
export const deleteAlertRule = async (ruleId) => (await api.delete(`/alerts/rules/${ruleId}`)).data;
export const runAlerts = async () => (await api.post("/alerts/run")).data;

export const getTopologyOverview = async () => (await api.get("/topology/overview")).data;
export const postTopologyRecompute = async () => (await api.post("/topology/recompute")).data;

export const getHealth = async () => (await api.get("/health")).data;
export const getReady = async () => (await api.get("/ready")).data;

export default api;
