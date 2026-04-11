import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import ProjectsPage from './pages/ProjectsPage';
import RowsPage from './pages/RowsPage';
import ImportExcelPage from './pages/ImportExcelPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import SettingsPage from './pages/SettingsPage';

function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function parseHash() {
  const hash = window.location.hash || '#/dashboard';
  if (hash === '#/dashboard') return { page: 'dashboard', projectId: null };
  if (hash === '#/projects') return { page: 'projects', projectId: null };
  if (hash === '#/settings') return { page: 'settings', projectId: null };
  const rowsMatch = hash.match(/^#\/project\/(\d+)\/rows$/);
  if (rowsMatch) return { page: 'rows', projectId: Number(rowsMatch[1]) };
  const importMatch = hash.match(/^#\/project\/(\d+)\/import$/);
  if (importMatch) return { page: 'import', projectId: Number(importMatch[1]) };
  return { page: 'dashboard', projectId: null };
}

function EMPTY_FORM() {
  return {
    customer_name: '', branch_name: '', branch_number: '', position_number: '',
    serial_number: '', installer_name: '', target_date: '', completed_date: '', status: 'pending'
  };
}

function getStoredUser() {
  try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
}
function getStoredDisplaySettings() {
  try { return JSON.parse(localStorage.getItem('displaySettings') || '{"theme":"dark","zoom":100}'); } catch { return { theme: 'dark', zoom: 100 }; }
}

export default function App() {
  const [user, setUser] = useState(getStoredUser());
  const [displaySettings, setDisplaySettings] = useState(getStoredDisplaySettings());
  const [route, setRoute] = useState(parseHash());
  const [projects, setProjects] = useState([]);
  const [rowsData, setRowsData] = useState({ rows: [], total: 0, page: 1, pageSize: 100 });
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const debouncedSearch = useDebouncedValue(search, 250);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [editingRowId, setEditingRowId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM());

  const selectedProject = useMemo(() => projects.find((project) => project.id === route.projectId) || null, [projects, route.projectId]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', displaySettings.theme || 'dark');
    document.documentElement.style.zoom = `${displaySettings.zoom || 100}%`;
    localStorage.setItem('displaySettings', JSON.stringify(displaySettings));
  }, [displaySettings]);

  useEffect(() => {
    function handleHashChange() { setRoute(parseHash()); }
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => { if (!window.location.hash) window.location.hash = '/dashboard'; }, []);

  async function loadProjects() {
    setLoadingProjects(true);
    try { setProjects(await api.getProjects()); setError(''); }
    catch (err) { setError(err.message); }
    finally { setLoadingProjects(false); }
  }

  async function loadRows(projectId = route.projectId, page = rowsData.page) {
    if (!projectId) return;
    setLoadingRows(true);
    try {
      const data = await api.getRows({ projectId, page, pageSize: rowsData.pageSize, search: debouncedSearch, status });
      setRowsData(data); setError('');
    } catch (err) { setError(err.message); }
    finally { setLoadingRows(false); }
  }

  useEffect(() => { if (user) loadProjects(); }, [user]);
  useEffect(() => {
    if (!user || route.page !== 'rows' || !route.projectId) return;
    setRowsData((prev) => ({ ...prev, page: 1 }));
    loadRows(route.projectId, 1);
  }, [user, route.page, route.projectId, debouncedSearch, status, refreshKey]);

  function goToDashboard() { window.location.hash = '/dashboard'; }
  function goToProjects() { window.location.hash = '/projects'; }
  function goToSettings() { window.location.hash = '/settings'; }
  function goToProjectRows(projectId) { window.location.hash = `/project/${projectId}/rows`; }
  function goToProjectImport(projectId) { window.location.hash = `/project/${projectId}/import`; }

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

  function resetForm() { setForm(EMPTY_FORM()); setEditingRowId(null); }
  function logout() { localStorage.removeItem('user'); setUser(null); }

  async function createProject(e) {
    e.preventDefault();
    if (!projectName.trim()) return;
    try {
      const created = await api.createProject({ name: projectName, description: projectDescription });
      setProjectName(''); setProjectDescription(''); await loadProjects(); setError(''); goToProjectRows(created.id);
    } catch (err) { setError(err.message); }
  }

async function deleteProject(projectId) {
  if (!window.confirm('למחוק את הפרויקט וכל השורות שבו?')) return;
  try {
    await api.deleteProject(projectId);
    await loadProjects();
    setError('');
    if (route.projectId === projectId) {
      goToProjects();
    }
  } catch (err) {
    setError(err.message);
    throw err;
  }
}

async function saveRow(e) {
    e.preventDefault();
    if (!route.projectId) return;
    try {
      if (editingRowId) {
        const updated = await api.updateRow(route.projectId, editingRowId, form);
        setRowsData((prev) => ({ ...prev, rows: prev.rows.map((row) => (row.id === updated.id ? updated : row)) }));
      } else {
        const created = await api.createRow(route.projectId, form);
        setRowsData((prev) => ({ ...prev, total: prev.total + 1, rows: [created, ...prev.rows].slice(0, prev.pageSize) }));
      }
      resetForm(); setError(''); setRefreshKey((prev) => prev + 1); loadProjects();
    } catch (err) { setError(err.message); }
  }

  function startEdit(row) {
    setEditingRowId(row.id);
    setForm({
      customer_name: row.customer_name || '', branch_name: row.branch_name || '', branch_number: row.branch_number || '', position_number: row.position_number || '',
      serial_number: row.serial_number || '', installer_name: row.installer_name || '', target_date: row.target_date || '', completed_date: row.completed_date || '', status: row.status || 'pending'
    });
  }

  async function deleteRow(rowId) {
    if (!route.projectId) return;
    if (!window.confirm('למחוק את הרשומה?')) return;
    try {
      await api.deleteRow(route.projectId, rowId);
      setRowsData((prev) => ({ ...prev, total: Math.max(0, prev.total - 1), rows: prev.rows.filter((row) => row.id !== rowId) }));
      setError(''); setRefreshKey((prev) => prev + 1); loadProjects();
    } catch (err) { setError(err.message); }
  }

  async function handleExport() {
    if (!route.projectId) return;
    try {
      const blob = await api.exportRows(route.projectId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `project-${route.projectId}.xlsx`; a.click(); URL.revokeObjectURL(url); setError('');
    } catch (err) { setError(err.message); }
  }

  if (!user) return <LoginPage onLogin={setUser} />;

  if (route.page === 'import' && route.projectId) return <ImportExcelPage projectId={route.projectId} projectName={selectedProject?.name || ''} onBack={() => goToProjectRows(route.projectId)} />;
  if (route.page === 'settings') return <SettingsPage user={user} onBack={goToDashboard} onLogout={logout} displaySettings={displaySettings} setDisplaySettings={setDisplaySettings} />;
  if (route.page === 'rows' && route.projectId) return <RowsPage projects={projects} selectedProject={selectedProject} rowsData={rowsData} loadingRows={loadingRows} loadingProjects={loadingProjects} error={error} search={search} setSearch={setSearch} status={status} setStatus={setStatus} form={form} setForm={setForm} editingRowId={editingRowId} updateForm={updateForm} resetForm={resetForm} saveRow={saveRow} startEdit={startEdit} deleteRow={deleteRow} loadRows={loadRows} handleExport={handleExport} goToProjects={goToProjects} goToImport={() => goToProjectImport(route.projectId)} setSelectedProject={(projectId) => { resetForm(); goToProjectRows(projectId); }} refreshKey={refreshKey} openSettings={goToSettings} user={user} />;
  if (route.page === 'projects') return <ProjectsPage projects={projects} loadingProjects={loadingProjects} error={error} projectName={projectName} setProjectName={setProjectName} projectDescription={projectDescription} setProjectDescription={setProjectDescription} createProject={createProject} openProject={goToProjectRows} openSettings={goToSettings} deleteProject={deleteProject} user={user} />;
  return <DashboardPage projects={projects} loadingProjects={loadingProjects} error={error} openProjectsPage={goToProjects} openProjectRows={goToProjectRows} openSettings={goToSettings} user={user} />;
}
