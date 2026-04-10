import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import ProjectsPage from './pages/ProjectsPage';
import RowsPage from './pages/RowsPage';
import ImportExcelPage from './pages/ImportExcelPage';

function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

function parseHash() {
  const hash = window.location.hash || '#/projects';

  if (hash === '#/projects') {
    return { page: 'projects', projectId: null };
  }

  const rowsMatch = hash.match(/^#\/project\/(\d+)\/rows$/);
  if (rowsMatch) {
    return { page: 'rows', projectId: Number(rowsMatch[1]) };
  }

  const importMatch = hash.match(/^#\/project\/(\d+)\/import$/);
  if (importMatch) {
    return { page: 'import', projectId: Number(importMatch[1]) };
  }

  return { page: 'projects', projectId: null };
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
    status: 'pending'
  };
}

export default function App() {
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
      window.location.hash = '/projects';
    }
  }, []);

  async function loadProjects() {
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
    if (!projectId) return;

    setLoadingRows(true);
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
      setLoadingRows(false);
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (route.page !== 'rows') return;
    if (!route.projectId) return;

    setRowsData((prev) => ({ ...prev, page: 1 }));
    loadRows(route.projectId, 1);
  }, [route.page, route.projectId, debouncedSearch, status, refreshKey]);

  function goToProjects() {
    window.location.hash = '/projects';
  }

  function goToProjectRows(projectId) {
    window.location.hash = `/project/${projectId}/rows`;
  }

  function goToProjectImport(projectId) {
    window.location.hash = `/project/${projectId}/import`;
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

        setProjects((prev) =>
          prev.map((project) =>
            project.id === route.projectId
              ? { ...project, rows_count: (project.rows_count || 0) + 1 }
              : project
          )
        );
      }

      resetForm();
      setError('');
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
      status: row.status || 'pending'
    });
  }

  async function deleteRow(rowId) {
    if (!route.projectId) return;
    if (!window.confirm('למחוק את הרשומה?')) return;

    try {
      await api.deleteRow(route.projectId, rowId);

      setRowsData((prev) => ({
        ...prev,
        total: Math.max(0, prev.total - 1),
        rows: prev.rows.filter((row) => row.id !== rowId)
      }));

      setProjects((prev) =>
        prev.map((project) =>
          project.id === route.projectId
            ? { ...project, rows_count: Math.max(0, (project.rows_count || 1) - 1) }
            : project
        )
      );

      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleExport() {
    if (!route.projectId) return;

    try {
      const blob = await api.exportRows(route.projectId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `project-${route.projectId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  function handleImportedRefresh() {
    loadProjects();
    setRefreshKey((prev) => prev + 1);
  }

  if (route.page === 'import' && route.projectId) {
    return (
      <ImportExcelPage
        projectId={route.projectId}
        projectName={selectedProject?.name || ''}
        onBack={() => goToProjectRows(route.projectId)}
        onImported={handleImportedRefresh}
      />
    );
  }

  if (route.page === 'rows' && route.projectId) {
    return (
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
        form={form}
        setForm={setForm}
        editingRowId={editingRowId}
        updateForm={updateForm}
        resetForm={resetForm}
        saveRow={saveRow}
        startEdit={startEdit}
        deleteRow={deleteRow}
        loadRows={loadRows}
        handleExport={handleExport}
        goToProjects={goToProjects}
        goToImport={() => goToProjectImport(route.projectId)}
        setSelectedProject={(projectId) => {
          resetForm();
          goToProjectRows(projectId);
        }}
      />
    );
  }

  return (
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
    />
  );
}