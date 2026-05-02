/**
 * Підприємства, що зустрічаються у топології (вузол ПС + об'єкти site).
 * @param {unknown[]} substations
 * @returns {{ id: number, name: string }[]}
 */
export function collectEnterprisesFromTopology(substations) {
  const map = new Map();
  for (const sub of substations || []) {
    if (sub?.enterprise_id != null && sub.enterprise_name) {
      map.set(Number(sub.enterprise_id), String(sub.enterprise_name));
    }
    for (const tr of sub?.transformers || []) {
      for (const line of tr?.lines || []) {
        for (const site of line?.sites || []) {
          if (site?.enterprise_id != null && site.enterprise_name) {
            map.set(Number(site.enterprise_id), String(site.enterprise_name));
          }
        }
      }
    }
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "uk"));
}

/**
 * Граф без обрізання: усі підстанції.
 * З обраним enterpriseId — залишаються лише ланки до об'єктів (site) цього підприємства;
 * порожні лінії / ТР / ПС прибираються.
 * @param {unknown[]} substations
 * @param {string|number|""|null|undefined} enterpriseId — "" / null: без фільтра
 * @returns {unknown[]}
 */
export function pruneTopologyBySiteEnterprise(substations, enterpriseId) {
  if (enterpriseId === "" || enterpriseId == null || enterpriseId === "all") {
    return substations || [];
  }
  const eid = Number(enterpriseId);
  if (Number.isNaN(eid)) {
    return substations || [];
  }

  const out = [];
  for (const sub of substations || []) {
    const transformers = (sub.transformers || [])
      .map((tr) => {
        const lines = (tr.lines || [])
          .map((line) => {
            const sites = (line.sites || []).filter(
              (site) => site?.enterprise_id != null && Number(site.enterprise_id) === eid
            );
            if (sites.length === 0) {
              return null;
            }
            return { ...line, sites };
          })
          .filter(Boolean);
        if (lines.length === 0) {
          return null;
        }
        return { ...tr, lines };
      })
      .filter(Boolean);
    if (transformers.length === 0) {
      continue;
    }
    out.push({ ...sub, transformers });
  }
  return out;
}
