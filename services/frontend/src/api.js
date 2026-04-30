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

export const getAlerts = async () => (await api.get("/alerts")).data;
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
