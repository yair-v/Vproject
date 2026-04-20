export function normalizeStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['completed', 'done', 'בוצע'].includes(normalized)) return 'completed';
  return 'pending';
}

export function statusLabel(value) {
  return normalizeStatus(value) === 'completed' ? 'בוצע' : 'ממתין';
}

function excelSerialToDate(serial) {
  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  const wholeDays = Math.floor(Number(serial));
  const result = new Date(excelEpoch);
  result.setUTCDate(excelEpoch.getUTCDate() + wholeDays);
  return result;
}

export function toDbDate(value) {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    const asDate = excelSerialToDate(value);
    const yyyy = asDate.getUTCFullYear();
    const mm = String(asDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(asDate.getUTCDate()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy}`;
  }

  const str = String(value).trim();

  if (!str) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  if (/^\d{5}(\.\d+)?$/.test(str)) {
    const asDate = excelSerialToDate(Number(str));
    const yyyy = asDate.getUTCFullYear();
    const mm = String(asDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(asDate.getUTCDate()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy}`;
  }

  const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const [, dd, mm, yyyy] = match;
    return `${dd}/${mm}/${yyyy}`;
  }

  const asDate = new Date(str);
  if (!Number.isNaN(asDate.getTime())) {
    const yyyy = asDate.getFullYear();
    const mm = String(asDate.getMonth() + 1).padStart(2, '0');
    const dd = String(asDate.getDate()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy}`;
  }

  return null;
}

export function toDisplayDate(value) {
  if (!value && value !== 0) return '';

  const str = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return String(value);

  const [yyyy, mm, dd] = str.split('-');
  return `${dd}/${mm}/${yyyy}`;
}

export function todayDbDate() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy}`;
}