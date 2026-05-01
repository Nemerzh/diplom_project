import { FieldLabel, styles } from "../ui.jsx";

export default function ReportFilters({
  enterprises,
  enterpriseId,
  onEnterprise,
  substations,
  substationId,
  onSubstation,
  transformers,
  transformerId,
  onTransformer,
  lines,
  lineId,
  onLine,
  sitesOnLine,
  siteFilterId,
  onSiteFilter,
  dateFrom,
  dateTo,
  onDateFrom,
  onDateTo,
  granularity,
  onGranularity,
  onApply,
  onRebuild,
  onExportCsv,
  onExportPdf,
  loading
}) {
  return (
    <div style={styles.card}>
      <h3 style={{ marginTop: 0 }}>Фільтри звіту</h3>
      <p style={styles.muted}>Навантаження по лінії з деталізацією до об’єктів і лічильників</p>
      <div style={{ ...styles.grid3, marginTop: 12 }}>
        <div>
          <FieldLabel text="Підприємство" />
          <select style={styles.input} value={enterpriseId} onChange={(e) => onEnterprise(e.target.value)}>
            <option value="">— оберіть —</option>
            {enterprises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel text="Підстанція" />
          <select style={styles.input} value={substationId} onChange={(e) => onSubstation(e.target.value)} disabled={!enterpriseId}>
            <option value="">— оберіть —</option>
            {substations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || s.code}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel text="Трансформатор" />
          <select style={styles.input} value={transformerId} onChange={(e) => onTransformer(e.target.value)} disabled={!substationId}>
            <option value="">— оберіть —</option>
            {transformers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} {t.name ? `— ${t.name}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel text="Лінія" />
          <select style={styles.input} value={lineId} onChange={(e) => onLine(e.target.value)} disabled={!transformerId}>
            <option value="">— оберіть —</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} — {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel text="Об'єкт (необов'язково)" />
          <select style={styles.input} value={siteFilterId} onChange={(e) => onSiteFilter(e.target.value)} disabled={!lineId}>
            <option value="">Усі об'єкти на лінії</option>
            {sitesOnLine.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel text="Гранулярність" />
          <select style={styles.input} value={granularity} onChange={(e) => onGranularity(e.target.value)}>
            <option value="hourly">Погодинно</option>
            <option value="daily">Подобово</option>
            <option value="monthly">Помісячно</option>
          </select>
        </div>
        <div>
          <FieldLabel text="Від дати" />
          <input type="date" style={styles.input} value={dateFrom} onChange={(e) => onDateFrom(e.target.value)} />
        </div>
        <div>
          <FieldLabel text="До дати" />
          <input type="date" style={styles.input} value={dateTo} onChange={(e) => onDateTo(e.target.value)} />
        </div>
      </div>
      <div style={{ ...styles.actionGroup, marginTop: 14 }}>
        <button type="button" style={styles.button} disabled={loading || !lineId} onClick={onApply}>
          Застосувати
        </button>
        <button type="button" style={styles.buttonSecondary} onClick={onRebuild}>
          Перебудувати агрегати
        </button>
        <button type="button" style={styles.buttonSecondary} disabled={!lineId} onClick={onExportCsv}>
          Експорт CSV
        </button>
        <button type="button" style={styles.buttonSecondary} onClick={onExportPdf}>
          Експорт PDF
        </button>
      </div>
    </div>
  );
}
