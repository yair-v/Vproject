import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import LookupInput from './components/LookupInput';

const EMPTY_FORM = {
  customer_name: '',
  branch_name: '',
  branch_number: '',
  position_number: '',
  serial_number: '',
  installer_name: '',
  target_date: '',
  completed_date: '',
  status: 'pending'
};

function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function App() {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [rowsData, setRowsData] = useState({ rows: [], total: 0, page: 1, pageSize: 100 });
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [editingRowId, setEditingRowId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const debouncedSearch = useDebouncedValue(search, 250);
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  async function loadProjects() {
    const data = await api.getProjects();
    setProjects(data);
    if (!selectedProjectId && data[0]) setSelectedProjectId(data[0].id);
    if (selectedProjectId && !data.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(data[0]?.id || null);
    }
  }

  async function loadRows(projectId = selectedProjectId, page = rowsData.page) {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await api.getRows({
        projectId,
        page,
        pageSize: rowsData.pageSize,
        search: debouncedSearch,
        status
      });
      setRowsData(data);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    setRowsData((prev) => ({ ...prev, page: 1 }));
    loadRows(selectedProjectId, 1);
  }, [selectedProjectId, debouncedSearch, status, refreshKey]);

  function updateForm(field, value) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'status' && value === 'completed') {
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const yyyy = today.getFullYear();
        const displayDate = `${dd}/${mm}/${yyyy}`;
        if (!next.target_date) next.target_date = displayDate;
        if (!next.completed_date) next.completed_date = displayDate;
      }
      return next;
    });
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingRowId(null);
  }

  async function saveProject(e) {
    e.preventDefault();
    if (!projectName.trim()) return;
    const created = await api.createProject({ name: projectName, description: projectDescription });
    await loadProjects();
    setSelectedProjectId(created.id);
    setProjectName('');
    setProjectDescription('');
  }

  async function saveRow(e) {
    e.preventDefault();
    if (!selectedProjectId) return;

    try {
      if (editingRowId) {
        const updated = await api.updateRow(selectedProjectId, editingRowId, form);
        setRowsData((prev) => ({ ...prev, rows: prev.rows.map((row) => (row.id === updated.id ? updated : row)) }));
      } else {
        const created = await api.createRow(selectedProjectId, form);
        setRowsData((prev) => ({
          ...prev,
          total: prev.total + 1,
          rows: [created, ...prev.rows].slice(0, prev.pageSize)
        }));
        setProjects((prev) => prev.map((project) => (
          project.id === selectedProjectId
            ? { ...project, rows_count: (project.rows_count || 0) + 1 }
            : project
        )));
      }
      resetForm();
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function startEdit(row) {
    setEditingRowId(row.id);
    setForm({
      customer_name: row.customer_name || '',
      branch_name: row.branch_name || '',
      branch_number: row.branch_number || '',
      position_number: row.position_number || '',
      serial_number: row.serial_number || '',
      installer_name: row.installer_name || '',
      target_date: row.target_date || '',
      completed_date: row.completed_date || '',
      status: row.status || 'pending'
    });
  }

  async function deleteRow(rowId) {
    if (!selectedProjectId) return;
    if (!window.confirm('למחוק את הרשומה?')) return;
    await api.deleteRow(selectedProjectId, rowId);
    setRowsData((prev) => ({
      ...prev,
      total: Math.max(0, prev.total - 1),
      rows: prev.rows.filter((row) => row.id !== rowId)
    }));
    setProjects((prev) => prev.map((project) => (
      project.id === selectedProjectId
        ? { ...project, rows_count: Math.max(0, (project.rows_count || 1) - 1) }
        : project
    )));
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    if (!file || !selectedProjectId) return;
    try {
      const result = await api.importRows(selectedProjectId, file);
      await loadProjects();
      setRefreshKey((prev) => prev + 1);
      const message = `נוספו ${result.inserted} שורות` + (result.errors.length ? `, עם ${result.errors.length} שגיאות` : '');
      alert(message);
    } catch (err) {
      setError(err.message);
    } finally {
      event.target.value = '';
    }
  }

  async function handleExport() {
    if (!selectedProjectId) return;
    const blob = await api.exportRows(selectedProjectId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project-${selectedProjectId}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar card">
        <div className="sidebar-header">
          <h1>פרויקטים</h1>
          <p>מערכת קלה ומהירה, עם עדכון שורות בלי רענון מלא של הרשימה.</p>
        </div>

        <form className="project-form" onSubmit={saveProject}>
          <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="שם פרויקט" />
          <input value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)} placeholder="תיאור" />
          <button type="submit">צור פרויקט</button>
        </form>

        <div className="project-list">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              className={`project-item ${project.id === selectedProjectId ? 'active' : ''}`}
              onClick={() => {
                setSelectedProjectId(project.id);
                resetForm();
              }}
            >
              <strong>{project.name}</strong>
              <span>{project.rows_count || 0} שורות</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="main-panel">
        <section className="toolbar card">
          <div>
            <h2>{selectedProject?.name || 'בחר פרויקט'}</h2>
            <p>{selectedProject?.description || 'ניהול מהיר של פרויקטים קטנים עם חיפוש, ייבוא וייצוא.'}</p>
          </div>
          <div className="toolbar-actions">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש חכם..." />
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">כל הסטטוסים</option>
              <option value="pending">ממתין</option>
              <option value="completed">בוצע</option>
            </select>
            <label className="file-button">
              ייבוא אקסל
              <input type="file" accept=".xlsx,.xls" onChange={handleImport} hidden />
            </label>
            <button type="button" onClick={handleExport}>ייצוא אקסל</button>
          </div>
        </section>

        <section className="content-grid">
          <section className="card form-card">
            <h3>{editingRowId ? 'עריכת שורה' : 'הוספת שורה'}</h3>
            <form className="row-form" onSubmit={saveRow}>
              <LookupInput
                label="לקוח"
                value={form.customer_name}
                onChange={(value) => updateForm('customer_name', value)}
                loadOptions={api.getCustomers}
                onCreate={api.createCustomer}
                placeholder="חפש או הוסף לקוח"
              />
              <label className="field"><span>שם סניף</span><input value={form.branch_name} onChange={(e) => updateForm('branch_name', e.target.value)} /></label>
              <label className="field"><span>מספר סניף</span><input value={form.branch_number} onChange={(e) => updateForm('branch_number', e.target.value)} /></label>
              <label className="field"><span>מספר עמדה</span><input value={form.position_number} onChange={(e) => updateForm('position_number', e.target.value)} /></label>
              <label className="field"><span>מספר סידורי *</span><input value={form.serial_number} onChange={(e) => updateForm('serial_number', e.target.value)} required /></label>
              <LookupInput
                label="שם מתקין"
                required={form.status === 'completed'}
                value={form.installer_name}
                onChange={(value) => updateForm('installer_name', value)}
                loadOptions={api.getInstallers}
                onCreate={api.createInstaller}
                placeholder="חפש או הוסף מתקין"
              />
              <label className="field"><span>תאריך יעד</span><input value={form.target_date} placeholder="DD/MM/YYYY" onChange={(e) => updateForm('target_date', e.target.value)} /></label>
              <label className="field"><span>תאריך ביצוע</span><input value={form.completed_date} placeholder="DD/MM/YYYY" onChange={(e) => updateForm('completed_date', e.target.value)} /></label>
              <label className="field"><span>סטטוס</span>
                <select value={form.status} onChange={(e) => updateForm('status', e.target.value)}>
                  <option value="pending">ממתין</option>
                  <option value="completed">בוצע</option>
                </select>
              </label>
              <div className="form-actions">
                <button type="submit">{editingRowId ? 'שמור שינויים' : 'הוסף שורה'}</button>
                {editingRowId && <button type="button" className="secondary" onClick={resetForm}>ביטול</button>}
              </div>
            </form>
            {error && <div className="error-box">{error}</div>}
          </section>

          <section className="card table-card">
            <div className="table-meta">
              <strong>{rowsData.total} שורות</strong>
              <div className="pagination">
                <button type="button" disabled={rowsData.page <= 1} onClick={() => loadRows(selectedProjectId, rowsData.page - 1)}>הקודם</button>
                <span>עמוד {rowsData.page}</span>
                <button
                  type="button"
                  disabled={rowsData.page * rowsData.pageSize >= rowsData.total}
                  onClick={() => loadRows(selectedProjectId, rowsData.page + 1)}
                >
                  הבא
                </button>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>לקוח</th>
                    <th>שם סניף</th>
                    <th>מספר סניף</th>
                    <th>מספר עמדה</th>
                    <th>מספר סידורי</th>
                    <th>שם מתקין</th>
                    <th>תאריך יעד</th>
                    <th>תאריך ביצוע</th>
                    <th>סטטוס</th>
                    <th>פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="10" className="empty">טוען...</td></tr>
                  ) : rowsData.rows.length ? rowsData.rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.customer_name}</td>
                      <td>{row.branch_name}</td>
                      <td>{row.branch_number}</td>
                      <td>{row.position_number}</td>
                      <td>{row.serial_number}</td>
                      <td>{row.installer_name}</td>
                      <td>{row.target_date}</td>
                      <td>{row.completed_date}</td>
                      <td><span className={`status ${row.status}`}>{row.status_label}</span></td>
                      <td>
                        <div className="row-actions">
                          <button type="button" onClick={() => startEdit(row)}>ערוך</button>
                          <button type="button" className="danger" onClick={() => deleteRow(row.id)}>מחק</button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan="10" className="empty">אין נתונים להצגה</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}
