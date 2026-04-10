export function toDbDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

export function toDisplayDate(value) {
  if (!value) return '';
  const dateOnly = String(value).slice(0, 10);
  const match = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const [, yyyy, mm, dd] = match;
  return `${dd}/${mm}/${yyyy}`;
}

export function todayDbDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeStatus(value) {
  if (value === 'בוצע' || value === 'completed') return 'completed';
  return 'pending';
}

export function statusLabel(value) {
  return value === 'completed' ? 'בוצע' : 'ממתין';
}
