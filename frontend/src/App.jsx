import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import ProjectsPage from './pages/ProjectsPage';
import RowsPage from './pages/RowsPage';
import ImportExcelPage from './pages/ImportExcelPage';
import DashboardPage from './pages/DashboardPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import FloatingMenu from './components/FloatingMenu';

function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

function parseHash() {
  const hash = window.location.hash || '#/login';

  if (hash === '#/login') return { page: 'login', projectId: null };
  if (hash === '#/dashboard') return { page: 'dashboard', projectId: null };
  if (hash === '#/projects') return { page: 'projects', projectId: null };
  if (hash === '#/settings') return { page: 'settings', projectId: null };

  const rowsMatch = hash.match(/^#\/project\/(\d+)\/rows$/);
  if (rowsMatch) return { page: 'rows', projectId: Number(rowsMatch[1]) };

  const importMatch = hash.match(/^#\/project\/(\d+)\/import$/);
  if (importMatch) return { page: 'import', projectId: Number(importMatch[1]) };

  return { page: 'login', projectId: null };
}

function EMPTY_FORM() {
  return {
    customer_name: '',
    branch_name: '',
    branch_number: '',
    position_number: '',
    serial_number: '',
    installer_name: '',
    target_date: '',
    completed_date: '',
    status: 'pending',
    custom_data: {}
  };
}

export default function App() {
  const [route, setRoute] = useState(parseHash());

  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  });

  const [displaySettings, setDisplaySettings] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('displaySettings') || 'null') || { theme: 'dark', zoom: 100 };
    } catch {
      return { theme: 'dark', zoom: 100 };
    }
  });

  const [projects, setProjects] = useState([]);
  const [rowsData, setRowsData] = useState({
    rows: [],
    total: 0,
    page: 1,
    pageSize: 100
  });

  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [rowFilters, setRowFilters] = useState({});
  const [sortKey, setSortKey] = useState('updated_at');
  const [sortDir, setSortDir] = useState('desc');
  const debouncedSearch = useDebouncedValue(search, 250);
  const debouncedRowFilters = useDebouncedValue(rowFilters, 250);

  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');

  const [editingRowId, setEditingRowId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM());

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === route.projectId) || null,
    [projects, route.projectId]
  );

  useEffect(() => {
    function handleHashChange() {
      setRoute(parseHash());
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (!window.location.hash) {
      window.location.hash = user ? '/dashboard' : '/login';
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem('displaySettings', JSON.stringify(displaySettings));
    document.documentElement.setAttribute('data-theme', displaySettings.theme);
    document.documentElement.style.zoom = `${displaySettings.zoom}%`;
  }, [displaySettings]);

  useEffect(() => {
    if (!user) {
      if (route.page !== 'login') window.location.hash = '/login';
      return;
    }

    if (route.page === 'login') window.location.hash = '/dashboard';
  }, [user, route.page]);

  async function loadProjects() {
    if (!user) return;

    setLoadingProjects(true);
    try {
      const data = await api.getProjects();
      setProjects(data);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingProjects(false);
    }
  }

  async function loadRows(projectId = route.projectId, page = rowsData.page) {
    if (!projectId || !user) return;

    setLoadingRows(true);
    try {
      const data = await api.getRows({
        projectId,
        page,
        pageSize: rowsData.pageSize,
        search: debouncedSearch,
        status,
        filters: debouncedRowFilters,
        sortKey,
        sortDir
      });
      setRowsData(data);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingRows(false);
    }
  }

  useEffect(() => {
    if (user) loadProjects();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    if (route.page === 'dashboard' || route.page === 'projects') {
      loadProjects();
    }
  }, [route.page, user, refreshKey]);

  useEffect(() => {
    if (!user || route.page !== 'rows' || !route.projectId) return;

    setRowsData((prev) => ({ ...prev, page: 1 }));
    loadRows(route.projectId, 1);
  }, [route.page, route.projectId, debouncedSearch, status, debouncedRowFilters, sortKey, sortDir, refreshKey, user]);

  function goToProjects() {
    window.location.hash = '/projects';
  }

  function goToDashboard() {
    window.location.hash = '/dashboard';
  }

  function goToProjectRows(projectId) {
    window.location.hash = `/project/${projectId}/rows`;
  }

  function goToProjectImport(projectId) {
    window.location.hash = `/project/${projectId}/import`;
  }

  function goToSettings() {
    const currentHash = window.location.hash || '#/dashboard';
    sessionStorage.setItem('settingsBackHash', currentHash);
    window.location.hash = '/settings';
  }

  function goBackFromSettings() {
    window.location.hash = sessionStorage.getItem('settingsBackHash') || '#/dashboard';
  }

  function goBackGeneric() {
    if (route.page === 'settings') return goBackFromSettings();
    if (route.page === 'import' && route.projectId) return (window.location.hash = `/project/${route.projectId}/rows`);
    if (route.page === 'rows') return (window.location.hash = '/projects');
    if (route.page === 'projects') return (window.location.hash = '/dashboard');
    window.location.hash = '/dashboard';
  }

  function logout() {
    localStorage.removeItem('user');
    setUser(null);
    setProjects([]);
    setRowsData({ rows: [], total: 0, page: 1, pageSize: 100 });
    window.location.hash = '/login';
  }

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
    setForm(EMPTY_FORM());
    setEditingRowId(null);
  }

  async function createProject(e) {
    e.preventDefault();
    if (!projectName.trim()) return;

    try {
      const created = await api.createProject({
        name: projectName,
        description: projectDescription
      });

      setProjectName('');
      setProjectDescription('');
      await loadProjects();
      setError('');
      setRefreshKey((prev) => prev + 1);
      goToProjectRows(created.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveRow(e) {
    e.preventDefault();
    if (!route.projectId) return;

    try {
      if (editingRowId) {
        const updated = await api.updateRow(route.projectId, editingRowId, form);
        setRowsData((prev) => ({
          ...prev,
          rows: prev.rows.map((row) => (row.id === updated.id ? updated : row))
        }));
      } else {
        const created = await api.createRow(route.projectId, form);
        setRowsData((prev) => ({
          ...prev,
          total: prev.total + 1,
          rows: [created, ...prev.rows].slice(0, prev.pageSize)
        }));
      }

      resetForm();
      setError('');
      setRefreshKey((prev) => prev + 1);
      await loadProjects();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(row) {
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
      status: row.status || 'pending',
      custom_data: row.custom_data || {}
    });
  }

  async function removeRow(rowId) {
    if (!route.projectId) return;
    if (!window.confirm('למחוק את הרשומה?')) return;

    try {
      await api.deleteRow(route.projectId, rowId);
      setRowsData((prev) => ({
        ...prev,
        total: Math.max(0, prev.total - 1),
        rows: prev.rows.filter((row) => row.id !== rowId)
      }));
      setError('');
      setRefreshKey((prev) => prev + 1);
      await loadProjects();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeProject(projectId) {
    try {
      await api.deleteProject(projectId);
      await loadProjects();
      setRefreshKey((prev) => prev + 1);

      if (route.page === 'rows' && route.projectId === projectId) {
        goToProjects();
      }

      setError('');
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  async function handleExport() {
    if (!route.projectId) return;

    try {
      const blob = await api.exportRows(route.projectId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `project-${route.projectId}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  function handleLogin(nextUser) {
    setUser(nextUser);
    window.location.hash = '/dashboard';
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const floatingMenu = (
    <FloatingMenu
      user={user}
      onDashboard={goToDashboard}
      onProjects={goToProjects}
      onSettings={goToSettings}
      onBack={goBackGeneric}
      onLogout={logout}
    />
  );

  if (route.page === 'settings') {
    return (
      <>
        <SettingsPage
          user={user}
          onBack={goBackFromSettings}
          onLogout={logout}
          displaySettings={displaySettings}
          setDisplaySettings={setDisplaySettings}
        />
        {floatingMenu}
      </>
    );
  }

  if (route.page === 'import' && route.projectId) {
    return (
      <>
        <ImportExcelPage
          projectId={route.projectId}
          projectName={selectedProject?.name || ''}
          onBack={() => goToProjectRows(route.projectId)}
        />
        {floatingMenu}
      </>
    );
  }

  if (route.page === 'rows' && route.projectId) {
    return (
      <>
        <RowsPage
          projects={projects}
          selectedProject={selectedProject}
          rowsData={rowsData}
          loadingRows={loadingRows}
          loadingProjects={loadingProjects}
          error={error}
          search={search}
          setSearch={setSearch}
          status={status}
          setStatus={setStatus}
          rowFilters={rowFilters}
          setRowFilters={setRowFilters}
          sortKey={sortKey}
          setSortKey={setSortKey}
          sortDir={sortDir}
          setSortDir={setSortDir}
          form={form}
          setForm={setForm}
          editingRowId={editingRowId}
          updateForm={updateForm}
          resetForm={resetForm}
          saveRow={saveRow}
          startEdit={startEdit}
          deleteRow={removeRow}
          loadRows={loadRows}
          handleExport={handleExport}
          goToProjects={goToProjects}
          goToImport={() => goToProjectImport(route.projectId)}
          setSelectedProject={(projectId) => {
            resetForm();
            goToProjectRows(projectId);
          }}
          refreshKey={refreshKey}
          openSettings={goToSettings}
          user={user}
        />
        {floatingMenu}
      </>
    );
  }

  if (route.page === 'projects') {
    return (
      <>
        <ProjectsPage
          projects={projects}
          loadingProjects={loadingProjects}
          error={error}
          projectName={projectName}
          setProjectName={setProjectName}
          projectDescription={projectDescription}
          setProjectDescription={setProjectDescription}
          createProject={createProject}
          openProject={goToProjectRows}
          openSettings={goToSettings}
          deleteProject={removeProject}
          user={user}
        />
        {floatingMenu}
      </>
    );
  }

  return (
    <>
      <DashboardPage
        projects={projects}
        loadingProjects={loadingProjects}
        error={error}
        openProjectsPage={goToProjects}
        openProjectRows={goToProjectRows}
        openSettings={goToSettings}
        user={user}
      />
      {floatingMenu}
    </>
  );
}