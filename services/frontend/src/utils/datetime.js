// Узгоджена робота з часом на фронті:
//   - Бекенд віддає timestamps у UTC (формат ISO 8601). Якщо рядок випадково
//     приходить без таймзони — трактуємо його як UTC (така конвенція БД).
//   - Відображаємо завжди в Europe/Kyiv, незалежно від системної TZ браузера,
//     щоб демо однаково виглядало і з України, і з-за кордону.

export const APP_TIMEZONE = "Europe/Kyiv";
export const APP_LOCALE = "uk-UA";

const TZ_REGEX = /(?:Z|[+-]\d{2}:?\d{2})$/;

/** @param {string|number|Date|null|undefined} value */
export function parseUtc(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  let s = String(value).trim();
  if (!s) return null;
  if (!TZ_REGEX.test(s)) {
    s = `${s}Z`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Дата+час у Europe/Kyiv. */
export function formatDateTime(value, options = {}) {
  const d = parseUtc(value);
  if (!d) return "—";
  return d.toLocaleString(APP_LOCALE, {
    timeZone: APP_TIMEZONE,
    dateStyle: "short",
    timeStyle: "short",
    ...options
  });
}

/** Лише дата у Europe/Kyiv. */
export function formatDate(value, options = {}) {
  const d = parseUtc(value);
  if (!d) return "—";
  return d.toLocaleDateString(APP_LOCALE, {
    timeZone: APP_TIMEZONE,
    ...options
  });
}

/** Лише час у Europe/Kyiv. */
export function formatTime(value, options = {}) {
  const d = parseUtc(value);
  if (!d) return "—";
  return d.toLocaleTimeString(APP_LOCALE, {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    ...options
  });
}
