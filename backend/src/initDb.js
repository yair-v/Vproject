import bcrypt from 'bcryptjs';
import { query, pool } from './db.js';

async function init() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      twofa_secret TEXT,
      twofa_enabled BOOLEAN NOT NULL DEFAULT false,
      role TEXT NOT NULL DEFAULT 'manager' CHECK (role IN ('admin', 'manager')),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);


  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS twofa_secret TEXT;
  `);

  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS twofa_enabled BOOLEAN NOT NULL DEFAULT false;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS installers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS project_rows (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      branch_name TEXT DEFAULT '',
      branch_number TEXT DEFAULT '',
      position_number TEXT DEFAULT '',
      serial_number TEXT NOT NULL,
      installer_id INTEGER REFERENCES installers(id) ON DELETE SET NULL,
      target_date DATE,
      completed_date DATE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT unique_serial_per_project UNIQUE(project_id, serial_number)
    );
  `);

  await query(`
    ALTER TABLE project_rows
    ADD COLUMN IF NOT EXISTS custom_data JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS project_fields (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      field_key TEXT NOT NULL,
      field_label TEXT NOT NULL,
      field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'date', 'select', 'boolean')),
      is_required BOOLEAN NOT NULL DEFAULT false,
      options_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT unique_project_field_key UNIQUE(project_id, field_key)
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_project_rows_project_id
    ON project_rows(project_id);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_project_rows_serial_number
    ON project_rows(serial_number);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_project_rows_status
    ON project_rows(status);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_project_rows_target_date
    ON project_rows(target_date);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_project_rows_custom_data_gin
    ON project_rows
    USING GIN (custom_data);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_project_fields_project_id
    ON project_fields(project_id);
  `);

  await query(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  for (const tableName of ['projects', 'project_rows', 'project_fields']) {
    await query(`DROP TRIGGER IF EXISTS trigger_${tableName}_updated_at ON ${tableName};`);
    await query(`
      CREATE TRIGGER trigger_${tableName}_updated_at
      BEFORE UPDATE ON ${tableName}
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);
  }

  const adminUsername = process.env.ADMIN_USERNAME || 'yair';
  const adminPassword = process.env.ADMIN_PASSWORD || 'yair8878';

  const existingAdmin = await query(
    `SELECT id FROM users WHERE username = $1`,
    [adminUsername]
  );

  if (!existingAdmin.rowCount) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await query(
      `INSERT INTO users(username, password_hash, role)
       VALUES ($1, $2, 'admin')`,
      [adminUsername, passwordHash]
    );
    console.log(`Default admin created: ${adminUsername}`);
  }

  console.log('Database initialized successfully');
}

init()
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });