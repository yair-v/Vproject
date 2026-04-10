import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import XLSX from 'xlsx';
import { query } from './db.js';
import { normalizeStatus, statusLabel, toDbDate, toDisplayDate, todayDbDate } from './utils.js';

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || '*' }));
app.use(express.json({ limit: '10mb' }));

app.get('/health', async (_req, res) => {
  await query('SELECT 1');
  res.json({ ok: true });
});

app.get('/api/projects', async (_req, res) => {
  const result = await query(`
    SELECT p.id, p.name, p.description, p.created_at, p.updated_at,
      COUNT(r.id)::int AS rows_count
    FROM projects p
    LEFT JOIN project_rows r ON r.project_id = p.id
    GROUP BY p.id
    ORDER BY p.updated_at DESC, p.id DESC
  `);
  res.json(result.rows);
});

app.post('/api/projects', async (req, res) => {
  const { name, description = '' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Project name is required' });
  const result = await query(
    'INSERT INTO projects(name, description) VALUES ($1, $2) RETURNING *',
    [name.trim(), description.trim()]
  );
  res.status(201).json(result.rows[0]);
});

app.put('/api/projects/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description = '' } = req.body;
  const result = await query(
    'UPDATE projects SET name = $1, description = $2 WHERE id = $3 RETURNING *',
    [name.trim(), description.trim(), id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Project not found' });
  res.json(result.rows[0]);
});

app.delete('/api/projects/:id', async (req, res) => {
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
     LIMIT 50`,
    [search]
  );
  res.json(result.rows);
});

app.post('/api/customers', async (req, res) => {
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

app.get('/api/installers', async (req, res) => {
  const search = (req.query.search || '').toString().trim();
  const result = await query(
    `SELECT * FROM installers
     WHERE $1 = '' OR name ILIKE '%' || $1 || '%'
     ORDER BY name ASC
     LIMIT 50`,
    [search]
  );
  res.json(result.rows);
});

app.post('/api/installers', async (req, res) => {
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

app.get('/api/projects/:projectId/rows', async (req, res) => {
  const { projectId } = req.params;
  const page = Number(req.query.page || 1);
  const pageSize = Math.min(Number(req.query.pageSize || 100), 250);
  const offset = (page - 1) * pageSize;

  const search = (req.query.search || '').toString().trim();
  const status = (req.query.status || '').toString().trim();

  const where = [`r.project_id = $1`];
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

  res.json({
    page,
    pageSize,
    total: totalResult.rows[0].total,
    rows: result.rows.map(formatRow)
  });
});

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

  // חובה
  if (!serial) {
    throw new Error('מספר סידורי הוא שדה חובה');
  }

  // חייב להיות בדיוק 8 ספרות
  if (!/^\d{8}$/.test(serial)) {
    throw new Error('מספר סידורי חייב להיות 8 ספרות בדיוק');
  }

  data.serialNumber = serial;

  if (data.status === 'completed') {
    if (!String(data.installerName).trim()) {
      throw new Error('שם מתקין חובה כאשר הסטטוס הוא בוצע');
    }
    if (!data.targetDate) data.targetDate = todayDbDate();
    if (!data.completedDate) data.completedDate = todayDbDate();
  }
  const branchNumber = String(data.branchNumber || '').trim();
  const positionNumber = String(data.positionNumber || '').trim();

  // מספר סניף
  if (branchNumber && !/^\d{1,5}$/.test(branchNumber)) {
    throw new Error('מספר סניף חייב להיות מספר עד 5 ספרות');
  }

  // מספר עמדה
  if (positionNumber && !/^\d{1,5}$/.test(positionNumber)) {
    throw new Error('מספר עמדה חייב להיות מספר עד 5 ספרות');
  }

  data.branchNumber = branchNumber;
  data.positionNumber = positionNumber;

  return data;
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

app.post('/api/projects/:projectId/rows', async (req, res) => {
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
        data.status
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

    res.status(201).json(formatRow(rowResult.rows[0]));
  } catch (error) {
    if (error?.code === '23505') {
      return res.status(400).json({ error: 'המספר הסידורי כבר קיים בפרויקט הזה' });
    }
    res.status(400).json({ error: error.message || 'Failed to create row' });
  }
});

app.put('/api/projects/:projectId/rows/:rowId', async (req, res) => {
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

    res.json(formatRow(rowResult.rows[0]));
  } catch (error) {
    if (error?.code === '23505') {
      return res.status(400).json({ error: 'המספר הסידורי כבר קיים בפרויקט הזה' });
    }
    res.status(400).json({ error: error.message || 'Failed to update row' });
  }
});

app.delete('/api/projects/:projectId/rows/:rowId', async (req, res) => {
  const { rowId } = req.params;
  await query('DELETE FROM project_rows WHERE id = $1', [rowId]);
  res.status(204).end();
});

app.post('/api/projects/:projectId/import', upload.single('file'), async (req, res) => {
  const { projectId } = req.params;
  if (!req.file) return res.status(400).json({ error: 'Excel file is required' });

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

  if (rows.length > 2500) {
    return res.status(400).json({ error: 'ניתן לייבא עד 2500 שורות לפרויקט' });
  }

  const inserted = [];
  const errors = [];

  for (let index = 0; index < rows.length; index += 1) {
    try {
      const raw = rows[index];
      const data = validateAndNormalizeRow({
        customer_name: raw['לקוח'] || raw['customer_name'] || raw['Customer'],
        branch_name: raw['שם סניף'] || raw['branch_name'] || raw['Branch Name'],
        branch_number: raw['מספר סניף'] || raw['branch_number'] || raw['Branch Number'],
        position_number: raw['מספר עמדה'] || raw['position_number'] || raw['Position Number'],
        serial_number: raw['מספר סידורי'] || raw['serial_number'] || raw['Serial Number'],
        installer_name: raw['שם מתקין'] || raw['installer_name'] || raw['Installer'],
        target_date: raw['תאריך יעד'] || raw['target_date'] || raw['Target Date'],
        completed_date: raw['תאריך ביצוע'] || raw['completed_date'] || raw['Completed Date'],
        status: raw['סטטוס'] || raw['status'] || raw['Status']
      });

      const customer = await ensureNamedEntity('customers', data.customerName);
      const installer = await ensureNamedEntity('installers', data.installerName);
      const result = await query(
        `INSERT INTO project_rows(
          project_id, customer_id, branch_name, branch_number, position_number,
          serial_number, installer_id, target_date, completed_date, status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
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
          data.status
        ]
      );
      inserted.push(result.rows[0].id);
    } catch (error) {
      errors.push({ row: index + 2, error: error.message });
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
  res.status(500).json({ error: 'Server error' });
});

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
