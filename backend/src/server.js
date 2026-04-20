import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import XLSX from 'xlsx';
import bcrypt from 'bcryptjs';
import { query } from './db.js';
import { normalizeStatus, statusLabel, toDbDate, toDisplayDate, todayDbDate } from './utils.js';

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 4000;

const corsOriginRaw = (process.env.CORS_ORIGIN || '').trim();

const BASE_FIELDS = [
  { key: 'customer_name', label: 'לקוח', field_type: 'text', is_required: false, is_base: true },
  { key: 'branch_name', label: 'שם סניף', field_type: 'text', is_required: false, is_base: true },
  { key: 'branch_number', label: 'מספר סניף', field_type: 'number', is_required: false, is_base: true },
  { key: 'position_number', label: 'מספר עמדה', field_type: 'number', is_required: false, is_base: true },
  { key: 'serial_number', label: 'מספר סידורי', field_type: 'number', is_required: true, is_base: true },
  { key: 'installer_name', label: 'שם מתקין', field_type: 'text', is_required: false, is_base: true },
  { key: 'target_date', label: 'תאריך יעד', field_type: 'date', is_required: false, is_base: true },
  { key: 'completed_date', label: 'תאריך ביצוע', field_type: 'date', is_required: false, is_base: true },
  { key: 'status', label: 'סטטוס', field_type: 'select', is_required: true, is_base: true, options: ['ממתין', 'בוצע'] }
];

const BASE_FIELD_KEY_SET = new Set(BASE_FIELDS.map((field) => field.key));

const IMPORT_FIELD_SYNONYMS = {
  customer_name: ['לקוח', 'customer', 'customer name', 'customer_name', 'client', 'client name'],
  branch_name: ['שם סניף', 'branch', 'branch name', 'branch_name', 'site name'],
  branch_number: ['מספר סניף', 'branch number', 'branch no', 'branch_number', 'branch id'],
  position_number: ['מספר עמדה', 'position', 'position number', 'position_number', 'terminal position'],
  serial_number: ['מספר סידורי', 'serial', 'serial number', 'serial_number', 'sn'],
  installer_name: ['שם מתקין', 'installer', 'installer name', 'installer_name', 'technician'],
  target_date: ['תאריך יעד', 'target date', 'target', 'due date', 'target_date'],
  completed_date: ['תאריך ביצוע', 'completed date', 'execution date', 'done date', 'completed_date'],
  status: ['סטטוס', 'status', 'state']
};

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    if (!corsOriginRaw || corsOriginRaw === '*') {
      return callback(null, true);
    }

    const allowedOrigins = corsOriginRaw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  }
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

function normalizeHeaderValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function calcProgress(total, completed) {
  if (!total) return 0;
  return Math.round((completed / total) * 100);
}

function getAuthUser(req) {
  const id = Number(req.header('x-user-id') || 0);
  const role = req.header('x-user-role') || '';
  if (!id || !role) return null;
  return { id, role };
}

function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    if (!allowedRoles.includes(user.role)) return res.status(403).json({ error: 'No permission' });
    req.authUser = user;
    next();
  };
}

function fieldKeyFromLabel(label) {
  const base = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-֐-׿ ]/g, '')
    .replace(/[\s\-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `cf_${base || 'field'}_${Date.now().toString(36)}`;
}

function normalizeFieldOptions(value) {
  if (Array.isArray(value)) return value.map((x) => String(x ?? '').trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((x) => x.trim()).filter(Boolean);
  return [];
}

async function getProjectCustomFields(projectId) {
  const result = await query(
    `SELECT id, project_id, field_key, field_label, field_type, is_required, options_json, sort_order, is_active, created_at, updated_at
     FROM project_fields
     WHERE project_id = $1 AND is_active = true
     ORDER BY sort_order ASC, id ASC`,
    [projectId]
  );

  return result.rows.map((row) => ({
    ...row,
    is_base: false,
    options: Array.isArray(row.options_json) ? row.options_json : []
  }));
}

function getAllProjectFields(customFields = []) {
  return [
    ...BASE_FIELDS,
    ...customFields.map((field) => ({
      key: field.field_key,
      label: field.field_label,
      field_type: field.field_type,
      is_required: !!field.is_required,
      is_base: false,
      options: field.options || []
    }))
  ];
}

function guessAutoMapping(headers, fields) {
  const autoMapping = {};
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeHeaderValue(header)
  }));

  for (const field of fields) {
    const synonyms = field.is_base
      ? (IMPORT_FIELD_SYNONYMS[field.key] || [field.label])
      : [field.label, field.key];

    const normalizedSynonyms = synonyms.map(normalizeHeaderValue);

    const exactMatch = normalizedHeaders.find((header) =>
      normalizedSynonyms.includes(header.normalized)
    );

    if (exactMatch) {
      autoMapping[field.key] = exactMatch.original;
      continue;
    }

    const partialMatch = normalizedHeaders.find((header) =>
      normalizedSynonyms.some(
        (synonym) =>
          header.normalized.includes(synonym) || synonym.includes(header.normalized)
      )
    );

    if (partialMatch) {
      autoMapping[field.key] = partialMatch.original;
    }
  }

  return autoMapping;
}

function buildMappedPayload(rawRow, mapping = {}, customFields = []) {
  const payload = {
    customer_name: mapping.customer_name ? rawRow[mapping.customer_name] : '',
    branch_name: mapping.branch_name ? rawRow[mapping.branch_name] : '',
    branch_number: mapping.branch_number ? rawRow[mapping.branch_number] : '',
    position_number: mapping.position_number ? rawRow[mapping.position_number] : '',
    serial_number: mapping.serial_number ? rawRow[mapping.serial_number] : '',
    installer_name: mapping.installer_name ? rawRow[mapping.installer_name] : '',
    target_date: mapping.target_date ? rawRow[mapping.target_date] : '',
    completed_date: mapping.completed_date ? rawRow[mapping.completed_date] : '',
    status: mapping.status ? rawRow[mapping.status] : '',
    custom_data: {}
  };

  for (const field of customFields) {
    payload.custom_data[field.field_key] = mapping[field.field_key]
      ? rawRow[mapping[field.field_key]]
      : '';
  }

  return payload;
}

function sanitizeCustomData(rawData, customFields) {
  const source = rawData && typeof rawData === 'object' ? rawData : {};
  const sanitized = {};

  for (const field of customFields) {
    const raw = source[field.field_key];

    if (raw === undefined || raw === null || raw === '') {
      if (field.is_required) {
        throw new Error(`השדה "${field.field_label}" הוא שדה חובה`);
      }
      sanitized[field.field_key] = '';
      continue;
    }

    switch (field.field_type) {
      case 'number': {
        const numText = String(raw).trim();
        if (numText && !/^[-+]?\d+(\.\d+)?$/.test(numText)) {
          throw new Error(`השדה "${field.field_label}" חייב להיות מספר`);
        }
        sanitized[field.field_key] = numText;
        break;
      }

      case 'date': {
        const dbDate = toDbDate(raw);
        if (!dbDate) {
          throw new Error(`השדה "${field.field_label}" חייב להיות תאריך תקין`);
        }
        sanitized[field.field_key] = dbDate;
        break;
      }

      case 'boolean': {
        if (
          raw === true || raw === 'true' || raw === 1 || raw === '1' ||
          raw === 'yes' || raw === 'כן'
        ) {
          sanitized[field.field_key] = true;
        } else if (
          raw === false || raw === 'false' || raw === 0 || raw === '0' ||
          raw === 'no' || raw === 'לא'
        ) {
          sanitized[field.field_key] = false;
        } else {
          throw new Error(`השדה "${field.field_label}" חייב להיות כן/לא`);
        }
        break;
      }

      case 'select': {
        const value = String(raw).trim();
        const options = Array.isArray(field.options) ? field.options : [];
        if (options.length && !options.includes(value)) {
          throw new Error(`השדה "${field.field_label}" חייב להכיל ערך מתוך הרשימה`);
        }
        sanitized[field.field_key] = value;
        break;
      }

      default:
        sanitized[field.field_key] = String(raw).trim();
    }
  }

  return sanitized;
}

function formatCustomDataForDisplay(customData, customFields) {
  const source = customData && typeof customData === 'object' ? customData : {};
  const out = {};

  for (const field of customFields) {
    const value = source[field.field_key];
    if (field.field_type === 'date') out[field.field_key] = toDisplayDate(value);
    else if (field.field_type === 'boolean') out[field.field_key] = value === true ? 'כן' : value === false ? 'לא' : '';
    else out[field.field_key] = value ?? '';
  }

  return out;
}

function formatRow(row, customFields = []) {
  return {
    id: row.id,
    project_id: row.project_id,
    customer_id: row.customer_id,
    customer_name: row.customer_name || '',
    branch_name: row.branch_name || '',
    branch_number: row.branch_number || '',
    position_number: row.position_number || '',
    serial_number: row.serial_number || '',
    installer_id: row.installer_id,
    installer_name: row.installer_name || '',
    target_date: toDisplayDate(row.target_date),
    completed_date: toDisplayDate(row.completed_date),
    status: row.status,
    status_label: statusLabel(row.status),
    custom_data: formatCustomDataForDisplay(row.custom_data, customFields),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function ensureNamedEntity(table, name) {
  if (!name?.trim()) return null;

  const result = await query(
    `INSERT INTO ${table}(name)
     VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name`,
    [name.trim()]
  );

  return result.rows[0];
}

function validateAndNormalizeRow(payload, customFields = []) {
  const data = {
    customerName: payload.customer_name || payload.customerName || '',
    branchName: payload.branch_name || payload.branchName || '',
    branchNumber: payload.branch_number || payload.branchNumber || '',
    positionNumber: payload.position_number || payload.positionNumber || '',
    serialNumber: payload.serial_number || payload.serialNumber || '',
    installerName: payload.installer_name || payload.installerName || '',
    targetDate: toDbDate(payload.target_date || payload.targetDate || ''),
    completedDate: toDbDate(payload.completed_date || payload.completedDate || ''),
    status: normalizeStatus(payload.status),
    customData: payload.custom_data || payload.customData || {}
  };

  const serial = String(data.serialNumber).trim();
  if (!serial) throw new Error('מספר סידורי הוא שדה חובה');
  if (!/^\d{8}$/.test(serial)) throw new Error('מספר סידורי חייב להיות 8 ספרות בדיוק');
  data.serialNumber = serial;

  const branchNumber = String(data.branchNumber || '').trim();
  const positionNumber = String(data.positionNumber || '').trim();

  if (branchNumber && !/^\d{1,5}$/.test(branchNumber)) {
    throw new Error('מספר סניף חייב להיות מספר עד 5 ספרות');
  }

  if (positionNumber && !/^\d{1,5}$/.test(positionNumber)) {
    throw new Error('מספר עמדה חייב להיות מספר עד 5 ספרות');
  }

  data.branchNumber = branchNumber;
  data.positionNumber = positionNumber;

  if (data.status === 'completed') {
    if (!String(data.installerName).trim()) {
      throw new Error('שם מתקין חובה כאשר הסטטוס הוא בוצע');
    }
    if (!data.targetDate) data.targetDate = todayDbDate();
    if (!data.completedDate) data.completedDate = todayDbDate();
  }

  data.customData = sanitizeCustomData(data.customData, customFields);
  return data;
}

app.get('/health', async (_req, res) => {
  await query('SELECT 1');
  res.json({ ok: true });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const result = await query(`SELECT * FROM users WHERE username = $1`, [String(username).trim()]);
  if (!result.rowCount) {
    return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
  }

  const user = result.rows[0];
  const isValid = await bcrypt.compare(String(password), user.password_hash);

  if (!isValid) {
    return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
  }

  res.json({ id: user.id, username: user.username, role: user.role });
});

app.get('/api/users', requireRole(['admin']), async (_req, res) => {
  const result = await query(`SELECT id, username, role, created_at FROM users ORDER BY id DESC`);
  res.json(result.rows);
});

app.post('/api/users', requireRole(['admin']), async (req, res) => {
  const { username, password, role = 'manager' } = req.body || {};
  if (!username?.trim() || !password?.trim()) {
    return res.status(400).json({ error: 'שם משתמש וסיסמה הם שדות חובה' });
  }

  if (!['admin', 'manager'].includes(role)) {
    return res.status(400).json({ error: 'Role must be admin or manager' });
  }

  try {
    const hash = await bcrypt.hash(password.trim(), 10);
    const result = await query(
      `INSERT INTO users(username, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, username, role, created_at`,
      [username.trim(), hash, role]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error?.code === '23505') {
      return res.status(400).json({ error: 'User already exists' });
    }
    throw error;
  }
});

app.delete('/api/users/:id', requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  if (Number(id) === req.authUser.id) {
    return res.status(400).json({ error: 'לא ניתן למחוק את המשתמש הנוכחי' });
  }
  await query('DELETE FROM users WHERE id = $1', [id]);
  res.status(204).end();
});

app.put('/api/users/:id/password', requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { password } = req.body || {};
  if (!password?.trim()) {
    return res.status(400).json({ error: 'סיסמה חובה' });
  }

  const hash = await bcrypt.hash(password.trim(), 10);
  await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, id]);
  res.json({ success: true });
});

app.put('/api/users/:id/role', requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { role } = req.body || {};

  if (!['admin', 'manager'].includes(role)) {
    return res.status(400).json({ error: 'Role לא תקין' });
  }

  await query(`UPDATE users SET role = $1 WHERE id = $2`, [role, id]);
  res.json({ success: true });
});

app.get('/api/projects', async (_req, res) => {
  const result = await query(`
    SELECT p.id, p.name, p.description, p.created_at, p.updated_at,
           COUNT(r.id)::int AS rows_count,
           COUNT(r.id) FILTER (WHERE r.status = 'completed')::int AS completed_rows,
           COUNT(r.id) FILTER (WHERE r.status = 'pending')::int AS pending_rows
    FROM projects p
    LEFT JOIN project_rows r ON r.project_id = p.id
    GROUP BY p.id
    ORDER BY p.updated_at DESC, p.id DESC
  `);

  res.json(
    result.rows.map((row) => ({
      ...row,
      progress_pct: calcProgress(row.rows_count, row.completed_rows)
    }))
  );
});

app.get('/api/projects/:projectId/summary', async (req, res) => {
  const { projectId } = req.params;

  const projectResult = await query(
    `SELECT id, name, description, created_at, updated_at
     FROM projects
     WHERE id = $1`,
    [projectId]
  );

  if (!projectResult.rowCount) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const countsResult = await query(
    `SELECT
      COUNT(id)::int AS rows_count,
      COUNT(id) FILTER (WHERE status = 'completed')::int AS completed_rows,
      COUNT(id) FILTER (WHERE status = 'pending')::int AS pending_rows
     FROM project_rows
     WHERE project_id = $1`,
    [projectId]
  );

  const project = projectResult.rows[0];
  const counts = countsResult.rows[0];

  res.json({
    ...project,
    ...counts,
    progress_pct: calcProgress(counts.rows_count, counts.completed_rows)
  });
});

app.post('/api/projects', requireRole(['admin', 'manager']), async (req, res) => {
  const { name, description = '' } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Project name is required' });

  const result = await query(
    'INSERT INTO projects(name, description) VALUES ($1, $2) RETURNING *',
    [name.trim(), description.trim()]
  );

  res.status(201).json(result.rows[0]);
});

app.put('/api/projects/:id', requireRole(['admin', 'manager']), async (req, res) => {
  const { id } = req.params;
  const { name, description = '' } = req.body || {};

  if (!name?.trim()) return res.status(400).json({ error: 'Project name is required' });

  const result = await query(
    'UPDATE projects SET name = $1, description = $2 WHERE id = $3 RETURNING *',
    [name.trim(), description.trim(), id]
  );

  if (!result.rowCount) return res.status(404).json({ error: 'Project not found' });
  res.json(result.rows[0]);
});

app.delete('/api/projects/:id', requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  await query('DELETE FROM projects WHERE id = $1', [id]);
  res.status(204).end();
});

app.get('/api/projects/:projectId/fields', requireRole(['admin', 'manager']), async (req, res) => {
  const customFields = await getProjectCustomFields(req.params.projectId);
  res.json({ baseFields: BASE_FIELDS, customFields });
});

app.post('/api/projects/:projectId/fields', requireRole(['admin', 'manager']), async (req, res) => {
  const { projectId } = req.params;
  const { field_label, field_type, is_required = false, options = [], sort_order = 0 } = req.body || {};

  if (!field_label?.trim()) return res.status(400).json({ error: 'שם שדה הוא חובה' });
  if (!['text', 'number', 'date', 'select', 'boolean'].includes(field_type)) {
    return res.status(400).json({ error: 'סוג שדה לא תקין' });
  }

  const normalizedOptions = field_type === 'select' ? normalizeFieldOptions(options) : [];
  const result = await query(
    `INSERT INTO project_fields(project_id, field_key, field_label, field_type, is_required, options_json, sort_order, is_active)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,true)
     RETURNING *`,
    [
      projectId,
      fieldKeyFromLabel(field_label),
      field_label.trim(),
      field_type,
      Boolean(is_required),
      JSON.stringify(normalizedOptions),
      Number(sort_order || 0)
    ]
  );

  res.status(201).json({
    ...result.rows[0],
    is_base: false,
    options: result.rows[0].options_json || []
  });
});

app.put('/api/projects/:projectId/fields/:fieldId', requireRole(['admin', 'manager']), async (req, res) => {
  const { projectId, fieldId } = req.params;
  const { field_label, field_type, is_required = false, options = [], sort_order = 0, is_active = true } = req.body || {};

  if (!field_label?.trim()) return res.status(400).json({ error: 'שם שדה הוא חובה' });
  if (!['text', 'number', 'date', 'select', 'boolean'].includes(field_type)) {
    return res.status(400).json({ error: 'סוג שדה לא תקין' });
  }

  const normalizedOptions = field_type === 'select' ? normalizeFieldOptions(options) : [];
  const result = await query(
    `UPDATE project_fields
     SET field_label = $1, field_type = $2, is_required = $3, options_json = $4::jsonb, sort_order = $5, is_active = $6
     WHERE id = $7 AND project_id = $8
     RETURNING *`,
    [
      field_label.trim(),
      field_type,
      Boolean(is_required),
      JSON.stringify(normalizedOptions),
      Number(sort_order || 0),
      Boolean(is_active),
      fieldId,
      projectId
    ]
  );

  if (!result.rowCount) return res.status(404).json({ error: 'Field not found' });

  res.json({
    ...result.rows[0],
    is_base: false,
    options: result.rows[0].options_json || []
  });
});

app.delete('/api/projects/:projectId/fields/:fieldId', requireRole(['admin', 'manager']), async (req, res) => {
  const { projectId, fieldId } = req.params;

  const fieldResult = await query(
    `SELECT * FROM project_fields WHERE id = $1 AND project_id = $2`,
    [fieldId, projectId]
  );

  if (!fieldResult.rowCount) {
    return res.status(404).json({ error: 'Field not found' });
  }

  const field = fieldResult.rows[0];

  await query(`DELETE FROM project_fields WHERE id = $1 AND project_id = $2`, [fieldId, projectId]);
  await query(
    `UPDATE project_rows SET custom_data = custom_data - $1 WHERE project_id = $2`,
    [field.field_key, projectId]
  );

  res.status(204).end();
});

app.get('/api/customers', async (req, res) => {
  const search = (req.query.search || '').toString().trim();
  const result = await query(
    `SELECT * FROM customers
     WHERE $1 = '' OR name ILIKE '%' || $1 || '%'
     ORDER BY name ASC
     LIMIT 200`,
    [search]
  );
  res.json(result.rows);
});

app.post('/api/customers', requireRole(['admin', 'manager']), async (req, res) => {
  const name = req.body.name?.trim();
  if (!name) return res.status(400).json({ error: 'Customer name is required' });

  const result = await query(
    `INSERT INTO customers(name)
     VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING *`,
    [name]
  );

  res.status(201).json(result.rows[0]);
});

app.put('/api/customers/:id', requireRole(['admin', 'manager']), async (req, res) => {
  const { id } = req.params;
  const name = req.body.name?.trim();
  if (!name) return res.status(400).json({ error: 'Customer name is required' });

  const result = await query(
    `UPDATE customers SET name = $1 WHERE id = $2 RETURNING *`,
    [name, id]
  );

  if (!result.rowCount) return res.status(404).json({ error: 'Customer not found' });
  res.json(result.rows[0]);
});

app.delete('/api/customers/:id', requireRole(['admin', 'manager']), async (req, res) => {
  const { id } = req.params;
  await query(`DELETE FROM customers WHERE id = $1`, [id]);
  res.status(204).end();
});

app.get('/api/installers', async (req, res) => {
  const search = (req.query.search || '').toString().trim();
  const result = await query(
    `SELECT * FROM installers
     WHERE $1 = '' OR name ILIKE '%' || $1 || '%'
     ORDER BY name ASC
     LIMIT 200`,
    [search]
  );
  res.json(result.rows);
});

app.post('/api/installers', requireRole(['admin', 'manager']), async (req, res) => {
  const name = req.body.name?.trim();
  if (!name) return res.status(400).json({ error: 'Installer name is required' });

  const result = await query(
    `INSERT INTO installers(name)
     VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING *`,
    [name]
  );

  res.status(201).json(result.rows[0]);
});

app.put('/api/installers/:id', requireRole(['admin', 'manager']), async (req, res) => {
  const { id } = req.params;
  const name = req.body.name?.trim();
  if (!name) return res.status(400).json({ error: 'Installer name is required' });

  const result = await query(
    `UPDATE installers SET name = $1 WHERE id = $2 RETURNING *`,
    [name, id]
  );

  if (!result.rowCount) return res.status(404).json({ error: 'Installer not found' });
  res.json(result.rows[0]);
});

app.delete('/api/installers/:id', requireRole(['admin', 'manager']), async (req, res) => {
  const { id } = req.params;
  await query(`DELETE FROM installers WHERE id = $1`, [id]);
  res.status(204).end();
});

app.get('/api/projects/:projectId/rows', async (req, res) => {
  const { projectId } = req.params;
  const page = Number(req.query.page || 1);
  const pageSize = Math.min(Number(req.query.pageSize || 100), 250);
  const offset = (page - 1) * pageSize;
  const search = (req.query.search || '').toString().trim();
  const status = (req.query.status || '').toString().trim();

  const customFields = await getProjectCustomFields(projectId);

  const where = ['r.project_id = $1'];
  const params = [projectId];

  if (search) {
    params.push(search);
    where.push(`(
      r.serial_number ILIKE '%' || $${params.length} || '%' OR
      r.branch_name ILIKE '%' || $${params.length} || '%' OR
      r.branch_number ILIKE '%' || $${params.length} || '%' OR
      r.position_number ILIKE '%' || $${params.length} || '%' OR
      c.name ILIKE '%' || $${params.length} || '%' OR
      i.name ILIKE '%' || $${params.length} || '%' OR
      CAST(r.custom_data AS TEXT) ILIKE '%' || $${params.length} || '%'
    )`);
  }

  if (status && ['pending', 'completed'].includes(status)) {
    params.push(status);
    where.push(`r.status = $${params.length}`);
  }

  const whereSql = where.join(' AND ');

  const totalResult = await query(
    `SELECT COUNT(*)::int AS total
     FROM project_rows r
     LEFT JOIN customers c ON c.id = r.customer_id
     LEFT JOIN installers i ON i.id = r.installer_id
     WHERE ${whereSql}`,
    params
  );

  params.push(pageSize, offset);

  const result = await query(
    `SELECT r.id, r.project_id, r.customer_id, c.name AS customer_name,
            r.branch_name, r.branch_number, r.position_number,
            r.serial_number, r.installer_id, i.name AS installer_name,
            r.target_date, r.completed_date, r.status,
            r.custom_data,
            r.created_at, r.updated_at
     FROM project_rows r
     LEFT JOIN customers c ON c.id = r.customer_id
     LEFT JOIN installers i ON i.id = r.installer_id
     WHERE ${whereSql}
     ORDER BY r.updated_at DESC, r.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  res.json({
    page,
    pageSize,
    total: totalResult.rows[0].total,
    rows: result.rows.map((row) => formatRow(row, customFields))
  });
});

app.post('/api/projects/:projectId/rows', requireRole(['admin', 'manager']), async (req, res) => {
  const { projectId } = req.params;

  try {
    const customFields = await getProjectCustomFields(projectId);
    const data = validateAndNormalizeRow(req.body, customFields);
    const customer = await ensureNamedEntity('customers', data.customerName);
    const installer = await ensureNamedEntity('installers', data.installerName);

    const result = await query(
      `INSERT INTO project_rows(
        project_id, customer_id, branch_name, branch_number, position_number,
        serial_number, installer_id, target_date, completed_date, status, custom_data
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
      RETURNING *`,
      [
        projectId,
        customer?.id || null,
        data.branchName,
        data.branchNumber,
        data.positionNumber,
        data.serialNumber.trim(),
        installer?.id || null,
        data.targetDate,
        data.completedDate,
        data.status,
        JSON.stringify(data.customData || {})
      ]
    );

    const rowResult = await query(
      `SELECT r.*, c.name AS customer_name, i.name AS installer_name
       FROM project_rows r
       LEFT JOIN customers c ON c.id = r.customer_id
       LEFT JOIN installers i ON i.id = r.installer_id
       WHERE r.id = $1`,
      [result.rows[0].id]
    );

    res.status(201).json(formatRow(rowResult.rows[0], customFields));
  } catch (error) {
    if (error?.code === '23505') {
      return res.status(400).json({ error: 'המספר הסידורי כבר קיים בפרויקט הזה' });
    }
    res.status(400).json({ error: error.message || 'Failed to create row' });
  }
});

app.put('/api/projects/:projectId/rows/:rowId', requireRole(['admin', 'manager']), async (req, res) => {
  const { projectId, rowId } = req.params;

  try {
    const customFields = await getProjectCustomFields(projectId);
    const data = validateAndNormalizeRow(req.body, customFields);
    const customer = await ensureNamedEntity('customers', data.customerName);
    const installer = await ensureNamedEntity('installers', data.installerName);

    const result = await query(
      `UPDATE project_rows SET
        customer_id = $1,
        branch_name = $2,
        branch_number = $3,
        position_number = $4,
        serial_number = $5,
        installer_id = $6,
        target_date = $7,
        completed_date = $8,
        status = $9,
        custom_data = $10::jsonb
      WHERE id = $11
      RETURNING *`,
      [
        customer?.id || null,
        data.branchName,
        data.branchNumber,
        data.positionNumber,
        data.serialNumber.trim(),
        installer?.id || null,
        data.targetDate,
        data.completedDate,
        data.status,
        JSON.stringify(data.customData || {}),
        rowId
      ]
    );

    if (!result.rowCount) return res.status(404).json({ error: 'Row not found' });

    const rowResult = await query(
      `SELECT r.*, c.name AS customer_name, i.name AS installer_name
       FROM project_rows r
       LEFT JOIN customers c ON c.id = r.customer_id
       LEFT JOIN installers i ON i.id = r.installer_id
       WHERE r.id = $1`,
      [rowId]
    );

    res.json(formatRow(rowResult.rows[0], customFields));
  } catch (error) {
    if (error?.code === '23505') {
      return res.status(400).json({ error: 'המספר הסידורי כבר קיים בפרויקט הזה' });
    }
    res.status(400).json({ error: error.message || 'Failed to update row' });
  }
});

app.delete('/api/projects/:projectId/rows/:rowId', requireRole(['admin']), async (req, res) => {
  const { rowId } = req.params;
  await query('DELETE FROM project_rows WHERE id = $1', [rowId]);
  res.status(204).end();
});

app.post('/api/projects/:projectId/import-preview', requireRole(['admin', 'manager']), upload.single('file'), async (req, res) => {
  const { projectId } = req.params;
  if (!req.file) return res.status(400).json({ error: 'Excel file is required' });

  const customFields = await getProjectCustomFields(projectId);
  const allFields = getAllProjectFields(customFields);

  const workbook = XLSX.read(req.file.buffer, {
    type: 'buffer',
    cellDates: true
  });

  const sheetName = workbook.SheetNames[0];
  const allRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: '',
    raw: false
  });

  if (allRows.length > 2500) {
    return res.status(400).json({ error: 'ניתן לייבא עד 2500 שורות לפרויקט' });
  }

  const headers = Object.keys(allRows[0] || {});
  const autoMapping = guessAutoMapping(headers, allFields);

  res.json({
    headers,
    rows: allRows,
    preview: allRows.slice(0, 20),
    totalRows: allRows.length,
    autoMapping,
    fields: allFields
  });
});

app.post('/api/projects/:projectId/import-mapped', requireRole(['admin', 'manager']), async (req, res) => {
  const { projectId } = req.params;
  const { mapping = {}, rows = [] } = req.body || {};

  if (!Array.isArray(rows) || !rows.length) {
    return res.status(400).json({ error: 'אין שורות לייבוא' });
  }

  if (rows.length > 2500) {
    return res.status(400).json({ error: 'ניתן לייבא עד 2500 שורות לפרויקט' });
  }

  const customFields = await getProjectCustomFields(projectId);

  const inserted = [];
  const errors = [];

  for (let index = 0; index < rows.length; index += 1) {
    try {
      const raw = rows[index];
      const mappedPayload = buildMappedPayload(raw, mapping, customFields);
      const data = validateAndNormalizeRow(mappedPayload, customFields);

      const customer = await ensureNamedEntity('customers', data.customerName);
      const installer = await ensureNamedEntity('installers', data.installerName);

      const result = await query(
        `INSERT INTO project_rows(
          project_id, customer_id, branch_name, branch_number, position_number,
          serial_number, installer_id, target_date, completed_date, status, custom_data
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
        RETURNING id`,
        [
          projectId,
          customer?.id || null,
          data.branchName,
          data.branchNumber,
          data.positionNumber,
          data.serialNumber.trim(),
          installer?.id || null,
          data.targetDate,
          data.completedDate,
          data.status,
          JSON.stringify(data.customData || {})
        ]
      );

      inserted.push(result.rows[0].id);
    } catch (error) {
      errors.push({
        row: index + 2,
        error:
          error?.code === '23505'
            ? 'המספר הסידורי כבר קיים בפרויקט הזה'
            : (error.message || 'Import failed')
      });
    }
  }

  res.json({
    inserted: inserted.length,
    errors
  });
});

app.get('/api/projects/:projectId/export', async (req, res) => {
  const { projectId } = req.params;
  const customFields = await getProjectCustomFields(projectId);

  const result = await query(
    `SELECT c.name AS customer_name, r.branch_name, r.branch_number,
            r.position_number, r.serial_number, i.name AS installer_name,
            r.target_date, r.completed_date, r.status, r.custom_data
     FROM project_rows r
     LEFT JOIN customers c ON c.id = r.customer_id
     LEFT JOIN installers i ON i.id = r.installer_id
     WHERE r.project_id = $1
     ORDER BY r.id ASC`,
    [projectId]
  );

  const exportRows = result.rows.map((row) => {
    const base = {
      'לקוח': row.customer_name || '',
      'שם סניף': row.branch_name || '',
      'מספר סניף': row.branch_number || '',
      'מספר עמדה': row.position_number || '',
      'מספר סידורי': row.serial_number || '',
      'שם מתקין': row.installer_name || '',
      'תאריך יעד': toDisplayDate(row.target_date),
      'תאריך ביצוע': toDisplayDate(row.completed_date),
      'סטטוס': statusLabel(row.status)
    };

    const customDisplay = formatCustomDataForDisplay(row.custom_data, customFields);
    for (const field of customFields) {
      base[field.field_label] = customDisplay[field.field_key] ?? '';
    }

    return base;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(exportRows);
  XLSX.utils.book_append_sheet(wb, ws, 'ProjectRows');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="project-${projectId}.xlsx"`);
  res.send(buffer);
});

app.use((error, _req, res, _next) => {
  console.error(error);

  if (error?.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS blocked request' });
  }

  res.status(500).json({ error: 'Server error' });
});

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});