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

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (!corsOriginRaw || corsOriginRaw === '*') return callback(null, true);

    const allowedOrigins = corsOriginRaw.split(',').map((item) => item.trim()).filter(Boolean);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  }
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

const IMPORT_FIELD_LABELS = {
  customer_name: 'לקוח',
  branch_name: 'שם סניף',
  branch_number: 'מספר סניף',
  position_number: 'מספר עמדה',
  serial_number: 'מספר סידורי',
  installer_name: 'שם מתקין',
  target_date: 'תאריך יעד',
  completed_date: 'תאריך ביצוע',
  status: 'סטטוס'
};

const IMPORT_FIELD_SYNONYMS = {
  customer_name: ['לקוח', 'customer', 'customer name', 'customer_name', 'client'],
  branch_name: ['שם סניף', 'branch', 'branch name', 'branch_name'],
  branch_number: ['מספר סניף', 'branch number', 'branch no', 'branch_number'],
  position_number: ['מספר עמדה', 'position', 'position number', 'position_number'],
  serial_number: ['מספר סידורי', 'serial', 'serial number', 'serial_number', 'sn'],
  installer_name: ['שם מתקין', 'installer', 'installer name', 'installer_name'],
  target_date: ['תאריך יעד', 'target date', 'target', 'due date', 'target_date'],
  completed_date: ['תאריך ביצוע', 'completed date', 'execution date', 'completed_date'],
  status: ['סטטוס', 'status', 'state']
};

function normalizeHeaderValue(value) {
  return String(value || '').trim().toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ');
}

function guessAutoMapping(headers) {
  const autoMapping = {};
  const normalizedHeaders = headers.map((header) => ({ original: header, normalized: normalizeHeaderValue(header) }));

  Object.entries(IMPORT_FIELD_SYNONYMS).forEach(([field, synonyms]) => {
    const normalizedSynonyms = synonyms.map(normalizeHeaderValue);
    const exactMatch = normalizedHeaders.find((header) => normalizedSynonyms.includes(header.normalized));
    if (exactMatch) {
      autoMapping[field] = exactMatch.original;
      return;
    }
    const partialMatch = normalizedHeaders.find((header) =>
      normalizedSynonyms.some((synonym) => header.normalized.includes(synonym) || synonym.includes(header.normalized))
    );
    if (partialMatch) autoMapping[field] = partialMatch.original;
  });

  return autoMapping;
}

function buildMappedPayload(rawRow, mapping = {}) {
  return {
    customer_name: mapping.customer_name ? rawRow[mapping.customer_name] : '',
    branch_name: mapping.branch_name ? rawRow[mapping.branch_name] : '',
    branch_number: mapping.branch_number ? rawRow[mapping.branch_number] : '',
    position_number: mapping.position_number ? rawRow[mapping.position_number] : '',
    serial_number: mapping.serial_number ? rawRow[mapping.serial_number] : '',
    installer_name: mapping.installer_name ? rawRow[mapping.installer_name] : '',
    target_date: mapping.target_date ? rawRow[mapping.target_date] : '',
    completed_date: mapping.completed_date ? rawRow[mapping.completed_date] : '',
    status: mapping.status ? rawRow[mapping.status] : ''
  };
}

function calcProgress(total, completed) {
  if (!total) return 0;
  return Math.round((completed / total) * 100);
}

function getAuthUser(req) {
  const id = Number(req.header('x-user-id') || 0);
  const username = req.header('x-user-name') || '';
  const role = req.header('x-user-role') || '';
  if (!id || !username || !role) return null;
  return { id, username, role };
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

function formatRow(row) {
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

function validateAndNormalizeRow(payload) {
  const data = {
    customerName: payload.customer_name || payload.customerName || '',
    branchName: payload.branch_name || payload.branchName || '',
    branchNumber: payload.branch_number || payload.branchNumber || '',
    positionNumber: payload.position_number || payload.positionNumber || '',
    serialNumber: payload.serial_number || payload.serialNumber || '',
    installerName: payload.installer_name || payload.installerName || '',
    targetDate: toDbDate(payload.target_date || payload.targetDate || ''),
    completedDate: toDbDate(payload.completed_date || payload.completedDate || ''),
    status: normalizeStatus(payload.status)
  };

  const serial = String(data.serialNumber).trim();
  if (!serial) throw new Error('מספר סידורי הוא שדה חובה');
  if (!/^\d{8}$/.test(serial)) throw new Error('מספר סידורי חייב להיות 8 ספרות בדיוק');
  data.serialNumber = serial;

  const branchNumber = String(data.branchNumber || '').trim();
  const positionNumber = String(data.positionNumber || '').trim();
  if (branchNumber && !/^\d{1,5}$/.test(branchNumber)) throw new Error('מספר סניף חייב להיות מספר עד 5 ספרות');
  if (positionNumber && !/^\d{1,5}$/.test(positionNumber)) throw new Error('מספר עמדה חייב להיות מספר עד 5 ספרות');
  data.branchNumber = branchNumber;
  data.positionNumber = positionNumber;

  if (data.status === 'completed') {
    if (!String(data.installerName).trim()) throw new Error('שם מתקין חובה כאשר הסטטוס הוא בוצע');
    if (!data.targetDate) data.targetDate = todayDbDate();
    if (!data.completedDate) data.completedDate = todayDbDate();
  }

  return data;
}

app.get('/health', async (_req, res) => {
  await query('SELECT 1');
  res.json({ ok: true });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const result = await query(`SELECT * FROM users WHERE username = $1`, [String(username).trim()]);
  if (!result.rowCount) return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });

  const user = result.rows[0];
  const isValid = await bcrypt.compare(String(password), user.password_hash);
  if (!isValid) return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });

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
    if (error?.code === '23505') return res.status(400).json({ error: 'User already exists' });
    throw error;
  }
});


app.put('/api/users/:id/role', requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { role } = req.body || {};

  if (!['admin', 'manager'].includes(role)) {
    return res.status(400).json({ error: 'Role must be admin or manager' });
  }

  const targetUser = await query(`SELECT id, role FROM users WHERE id = $1`, [id]);
  if (!targetUser.rowCount) return res.status(404).json({ error: 'User not found' });

  if (Number(id) === req.authUser.id) {
    return res.status(400).json({ error: 'לא ניתן לשנות את ההרשאה של המשתמש הנוכחי' });
  }

  if (targetUser.rows[0].role === 'admin' && role !== 'admin') {
    const adminCount = await query(`SELECT COUNT(*)::int AS total FROM users WHERE role = 'admin'`);
    if (adminCount.rows[0].total <= 1) {
      return res.status(400).json({ error: 'לא ניתן להסיר את מנהל המערכת האחרון' });
    }
  }

  const result = await query(
    `UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, role, created_at`,
    [role, id]
  );

  res.json(result.rows[0]);
});

app.put('/api/users/:id/password', requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { password } = req.body || {};

  if (!password?.trim()) {
    return res.status(400).json({ error: 'סיסמה חובה' });
  }

  const targetUser = await query(`SELECT id FROM users WHERE id = $1`, [id]);
  if (!targetUser.rowCount) return res.status(404).json({ error: 'User not found' });

  const passwordHash = await bcrypt.hash(password.trim(), 10);
  await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, id]);
  res.json({ success: true });
});

app.delete('/api/users/:id', requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  const targetUser = await query(`SELECT id, role FROM users WHERE id = $1`, [id]);
  if (!targetUser.rowCount) return res.status(404).json({ error: 'User not found' });

  if (Number(id) === req.authUser.id) {
    return res.status(400).json({ error: 'לא ניתן למחוק את המשתמש הנוכחי' });
  }

  if (targetUser.rows[0].role === 'admin') {
    const adminCount = await query(`SELECT COUNT(*)::int AS total FROM users WHERE role = 'admin'`);
    if (adminCount.rows[0].total <= 1) {
      return res.status(400).json({ error: 'לא ניתן למחוק את מנהל המערכת האחרון' });
    }
  }

  await query(`DELETE FROM users WHERE id = $1`, [id]);
  res.status(204).end();
});

app.get('/api/projects', async (_req, res) => {
  const result = await query(`
    SELECT
      p.id,
      p.name,
      p.description,
      p.created_at,
      p.updated_at,
      COUNT(r.id)::int AS rows_count,
      COUNT(r.id) FILTER (WHERE r.status = 'completed')::int AS completed_rows,
      COUNT(r.id) FILTER (WHERE r.status = 'pending')::int AS pending_rows
    FROM projects p
    LEFT JOIN project_rows r ON r.project_id = p.id
    GROUP BY p.id
    ORDER BY p.updated_at DESC, p.id DESC
  `);

  res.json(result.rows.map((row) => ({ ...row, progress_pct: calcProgress(row.rows_count, row.completed_rows) })));
});

app.get('/api/projects/:projectId/summary', async (req, res) => {
  const { projectId } = req.params;

  const projectResult = await query(`SELECT id, name, description, created_at, updated_at FROM projects WHERE id = $1`, [projectId]);
  if (!projectResult.rowCount) return res.status(404).json({ error: 'Project not found' });

  const countsResult = await query(
    `SELECT COUNT(id)::int AS rows_count,
            COUNT(id) FILTER (WHERE status = 'completed')::int AS completed_rows,
            COUNT(id) FILTER (WHERE status = 'pending')::int AS pending_rows
     FROM project_rows
     WHERE project_id = $1`,
    [projectId]
  );

  const project = projectResult.rows[0];
  const counts = countsResult.rows[0];
  res.json({ ...project, ...counts, progress_pct: calcProgress(counts.rows_count, counts.completed_rows) });
});

app.post('/api/projects', requireRole(['admin', 'manager']), async (req, res) => {
  const { name, description = '' } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Project name is required' });

  const result = await query('INSERT INTO projects(name, description) VALUES ($1, $2) RETURNING *', [name.trim(), description.trim()]);
  res.status(201).json(result.rows[0]);
});

app.put('/api/projects/:id', requireRole(['admin', 'manager']), async (req, res) => {
  const { id } = req.params;
  const { name, description = '' } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Project name is required' });

  const result = await query('UPDATE projects SET name = $1, description = $2 WHERE id = $3 RETURNING *', [name.trim(), description.trim(), id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Project not found' });
  res.json(result.rows[0]);
});

app.delete('/api/projects/:id', requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  await query('DELETE FROM projects WHERE id = $1', [id]);
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
    `INSERT INTO customers(name) VALUES ($1)
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
  const result = await query(`UPDATE customers SET name = $1 WHERE id = $2 RETURNING *`, [name, id]);
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

app.post('/api/installers', requireRole(['admin']), async (req, res) => {
  const name = req.body.name?.trim();
  if (!name) return res.status(400).json({ error: 'Installer name is required' });

  const result = await query(
    `INSERT INTO installers(name) VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING *`,
    [name]
  );
  res.status(201).json(result.rows[0]);
});

app.put('/api/installers/:id', requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const name = req.body.name?.trim();
  if (!name) return res.status(400).json({ error: 'Installer name is required' });
  const result = await query(`UPDATE installers SET name = $1 WHERE id = $2 RETURNING *`, [name, id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Installer not found' });
  res.json(result.rows[0]);
});

app.delete('/api/installers/:id', requireRole(['admin']), async (req, res) => {
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
      i.name ILIKE '%' || $${params.length} || '%'
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
            r.created_at, r.updated_at
     FROM project_rows r
     LEFT JOIN customers c ON c.id = r.customer_id
     LEFT JOIN installers i ON i.id = r.installer_id
     WHERE ${whereSql}
     ORDER BY r.updated_at DESC, r.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  res.json({ page, pageSize, total: totalResult.rows[0].total, rows: result.rows.map(formatRow) });
});

app.post('/api/projects/:projectId/rows', requireRole(['admin', 'manager']), async (req, res) => {
  const { projectId } = req.params;
  try {
    const data = validateAndNormalizeRow(req.body);
    const customer = await ensureNamedEntity('customers', data.customerName);
    const installer = await ensureNamedEntity('installers', data.installerName);

    const result = await query(
      `INSERT INTO project_rows(
        project_id, customer_id, branch_name, branch_number, position_number,
        serial_number, installer_id, target_date, completed_date, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *`,
      [projectId, customer?.id || null, data.branchName, data.branchNumber, data.positionNumber, data.serialNumber.trim(), installer?.id || null, data.targetDate, data.completedDate, data.status]
    );

    const rowResult = await query(
      `SELECT r.*, c.name AS customer_name, i.name AS installer_name
       FROM project_rows r
       LEFT JOIN customers c ON c.id = r.customer_id
       LEFT JOIN installers i ON i.id = r.installer_id
       WHERE r.id = $1`,
      [result.rows[0].id]
    );

    res.status(201).json(formatRow(rowResult.rows[0]));
  } catch (error) {
    if (error?.code === '23505') return res.status(400).json({ error: 'המספר הסידורי כבר קיים בפרויקט הזה' });
    res.status(400).json({ error: error.message || 'Failed to create row' });
  }
});

app.put('/api/projects/:projectId/rows/:rowId', requireRole(['admin', 'manager']), async (req, res) => {
  const { rowId } = req.params;
  try {
    const data = validateAndNormalizeRow(req.body);
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
        status = $9
      WHERE id = $10
      RETURNING *`,
      [customer?.id || null, data.branchName, data.branchNumber, data.positionNumber, data.serialNumber.trim(), installer?.id || null, data.targetDate, data.completedDate, data.status, rowId]
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

    res.json(formatRow(rowResult.rows[0]));
  } catch (error) {
    if (error?.code === '23505') return res.status(400).json({ error: 'המספר הסידורי כבר קיים בפרויקט הזה' });
    res.status(400).json({ error: error.message || 'Failed to update row' });
  }
});

app.delete('/api/projects/:projectId/rows/:rowId', requireRole(['admin']), async (req, res) => {
  const { rowId } = req.params;
  await query('DELETE FROM project_rows WHERE id = $1', [rowId]);
  res.status(204).end();
});

app.post('/api/import/preview', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Excel file is required' });

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const allRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  if (allRows.length > 2500) return res.status(400).json({ error: 'ניתן לייבא עד 2500 שורות לפרויקט' });

  const headers = Object.keys(allRows[0] || {});
  const autoMapping = guessAutoMapping(headers);
  res.json({ headers, rows: allRows, preview: allRows.slice(0, 20), totalRows: allRows.length, autoMapping, fieldLabels: IMPORT_FIELD_LABELS });
});

app.post('/api/projects/:projectId/import-mapped', requireRole(['admin', 'manager']), async (req, res) => {
  const { projectId } = req.params;
  const { mapping = {}, rows = [] } = req.body || {};
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'אין שורות לייבוא' });
  if (rows.length > 2500) return res.status(400).json({ error: 'ניתן לייבא עד 2500 שורות לפרויקט' });

  const inserted = [];
  const errors = [];

  for (let index = 0; index < rows.length; index += 1) {
    try {
      const raw = rows[index];
      const mappedPayload = buildMappedPayload(raw, mapping);
      const data = validateAndNormalizeRow(mappedPayload);
      const customer = await ensureNamedEntity('customers', data.customerName);
      const installer = await ensureNamedEntity('installers', data.installerName);

      const result = await query(
        `INSERT INTO project_rows(
          project_id, customer_id, branch_name, branch_number, position_number,
          serial_number, installer_id, target_date, completed_date, status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id`,
        [projectId, customer?.id || null, data.branchName, data.branchNumber, data.positionNumber, data.serialNumber.trim(), installer?.id || null, data.targetDate, data.completedDate, data.status]
      );
      inserted.push(result.rows[0].id);
    } catch (error) {
      errors.push({ row: index + 2, error: error?.code === '23505' ? 'המספר הסידורי כבר קיים בפרויקט הזה' : (error.message || 'Import failed') });
    }
  }

  res.json({ inserted: inserted.length, errors });
});

app.get('/api/projects/:projectId/export', async (req, res) => {
  const { projectId } = req.params;
  const result = await query(
    `SELECT c.name AS customer_name, r.branch_name, r.branch_number,
            r.position_number, r.serial_number, i.name AS installer_name,
            r.target_date, r.completed_date, r.status
     FROM project_rows r
     LEFT JOIN customers c ON c.id = r.customer_id
     LEFT JOIN installers i ON i.id = r.installer_id
     WHERE r.project_id = $1
     ORDER BY r.id ASC`,
    [projectId]
  );

  const exportRows = result.rows.map((row) => ({
    'לקוח': row.customer_name || '',
    'שם סניף': row.branch_name || '',
    'מספר סניף': row.branch_number || '',
    'מספר עמדה': row.position_number || '',
    'מספר סידורי': row.serial_number || '',
    'שם מתקין': row.installer_name || '',
    'תאריך יעד': toDisplayDate(row.target_date),
    'תאריך ביצוע': toDisplayDate(row.completed_date),
    'סטטוס': statusLabel(row.status)
  }));

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
  if (error?.message === 'Not allowed by CORS') return res.status(403).json({ error: 'CORS blocked request' });
  res.status(500).json({ error: 'Server error' });
});

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
