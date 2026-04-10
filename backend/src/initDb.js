import { query, pool } from './db.js';

async function init() {
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

  await query(`CREATE INDEX IF NOT EXISTS idx_project_rows_project_id ON project_rows(project_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_project_rows_serial_number ON project_rows(serial_number);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_project_rows_status ON project_rows(status);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_project_rows_target_date ON project_rows(target_date);`);

  await query(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await query(`DROP TRIGGER IF EXISTS trigger_projects_updated_at ON projects;`);
  await query(`
    CREATE TRIGGER trigger_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await query(`DROP TRIGGER IF EXISTS trigger_project_rows_updated_at ON project_rows;`);
  await query(`
    CREATE TRIGGER trigger_project_rows_updated_at
    BEFORE UPDATE ON project_rows
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

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
