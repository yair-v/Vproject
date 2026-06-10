import { useEffect, useMemo, useRef, useState } from 'react';
import LookupInput from '../components/LookupInput';
import CustomFieldInput from '../components/CustomFieldInput';
import ProjectFieldsManager from '../components/ProjectFieldsManager';
import { api } from '../api';
import AppBrand from '../components/AppBrand';
import ProjectClock from '../components/ProjectClock';

export default function RowsPage({
  projects,
  selectedProject,
  rowsData,
  loadingRows,
  loadingProjects,
  error,
  search,
  setSearch,
  status,
  setStatus,
  form,
  setForm,
  editingRowId,
  updateForm,
  resetForm,
  saveRow,
  startEdit,
  deleteRow,
  loadRows,
  handleExport,
  goToProjects,
  goToImport,
  setSelectedProject,
  refreshKey,
  openSettings,
  user
}) {
  const totalProjects = projects.length;
  const [projectSummary, setProjectSummary] = useState({
    rows_count: 0,
    completed_rows: 0,
    pending_rows: 0
  });
  const [customFields, setCustomFields] = useState([]);
  const [statusOptions, setStatusOptions] = useState([
    { status_key: 'pending', label: 'ממתין', color: '#f59e0b' },
    { status_key: 'completed', label: 'בוצע', color: '#22c55e' }
  ]);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [columnFilters, setColumnFilters] = useState({});
  const [openFilterKey, setOpenFilterKey] = useState(null);
  const [showRowEditor, setShowRowEditor] = useState(false);
  const [columnOrder, setColumnOrder] = useState([]);
  const [draggedColumnKey, setDraggedColumnKey] = useState(null);
  const filterPanelRef = useRef(null);

  const sortedCustomFields = useMemo(() => {
    return [...customFields].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id
    );
  }, [customFields]);

  useEffect(() => {
    async function loadSummary() {
      if (!selectedProject?.id) return;

      try {
        const summary = await api.getProjectSummary(selectedProject.id);
        setProjectSummary(summary);
      } catch {
        setProjectSummary({
          rows_count: selectedProject?.rows_count || 0,
          completed_rows: selectedProject?.completed_rows || 0,
          pending_rows: selectedProject?.pending_rows || 0
        });
      }
    }

    loadSummary();
  }, [selectedProject?.id, refreshKey]);

  useEffect(() => {
    async function loadProjectFields() {
      if (!selectedProject?.id) {
        setCustomFields([]);
        return;
      }

      try {
        const result = await api.getProjectFields(selectedProject.id);
        setCustomFields(result.customFields || []);
      } catch {
        setCustomFields([]);
      }
    }

    loadProjectFields();
  }, [selectedProject?.id, refreshKey]);


  useEffect(() => {
    async function loadStatuses() {
      try {
        const result = await api.getStatuses();
        if (Array.isArray(result) && result.length) setStatusOptions(result);
      } catch {
        setStatusOptions([
          { status_key: 'pending', label: 'ממתין', color: '#f59e0b' },
          { status_key: 'completed', label: 'בוצע', color: '#22c55e' }
        ]);
      }
    }

    loadStatuses();
  }, [refreshKey]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (!filterPanelRef.current) return;
      if (!filterPanelRef.current.contains(event.target)) {
        setOpenFilterKey(null);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const tableColumns = useMemo(() => {
    return [
      { key: '__actions', label: 'פעולות', type: 'actions', noFilter: true },
      { key: 'customer_name', label: 'לקוח' },
      { key: 'branch_name', label: 'שם סניף' },
      { key: 'branch_number', label: 'מספר סניף' },
      { key: 'position_number', label: 'מספר עמדה' },
      { key: 'serial_number', label: 'מספר סידורי' },
      { key: 'installer_name', label: 'שם מתקין' },
      { key: 'target_date', label: 'תאריך יעד', type: 'date' },
      { key: 'completed_date', label: 'תאריך ביצוע', type: 'date' },
      ...sortedCustomFields.map((field) => ({
        key: field.field_key,
        label: field.field_label,
        isCustom: true
      })),
      { key: 'status_label', label: 'סטטוס' }
    ];
  }, [sortedCustomFields]);

  useEffect(() => {
    if (!selectedProject?.id) {
      setColumnOrder([]);
      return;
    }

    const storageKey = `vproject.columnOrder.${selectedProject.id}`;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
      setColumnOrder(Array.isArray(saved) ? saved : []);
    } catch {
      setColumnOrder([]);
    }
  }, [selectedProject?.id]);

  const orderedColumns = useMemo(() => {
    const keys = tableColumns.map((column) => column.key);
    const savedKeys = columnOrder.filter((key) => keys.includes(key));
    const missingKeys = keys.filter((key) => !savedKeys.includes(key));
    const finalKeys = savedKeys.length ? [...savedKeys, ...missingKeys] : keys;

    return finalKeys
      .map((key) => tableColumns.find((column) => column.key === key))
      .filter(Boolean);
  }, [tableColumns, columnOrder]);

  function saveColumnOrder(nextKeys) {
    setColumnOrder(nextKeys);
    if (!selectedProject?.id) return;

    try {
      localStorage.setItem(`vproject.columnOrder.${selectedProject.id}`, JSON.stringify(nextKeys));
    } catch {
      // localStorage can be blocked. The order will still work until page refresh.
    }
  }

  function resetColumnOrder() {
    saveColumnOrder(tableColumns.map((column) => column.key));
  }

  function moveColumn(fromKey, toKey) {
    if (!fromKey || !toKey || fromKey === toKey) return;

    const currentKeys = orderedColumns.map((column) => column.key);
    const fromIndex = currentKeys.indexOf(fromKey);
    const toIndex = currentKeys.indexOf(toKey);
    if (fromIndex < 0 || toIndex < 0) return;

    const nextKeys = [...currentKeys];
    const [moved] = nextKeys.splice(fromIndex, 1);
    nextKeys.splice(toIndex, 0, moved);
    saveColumnOrder(nextKeys);
  }

  function getColumnValue(row, key) {
    const value = row[key] ?? row.custom_data?.[key] ?? '';
    return value === null || value === undefined ? '' : String(value);
  }

  const filteredRows = useMemo(() => {
    return rowsData.rows.filter((row) => {
      return Object.entries(columnFilters).every(([key, filter]) => {
        if (!filter) return true;
        const value = getColumnValue(row, key);
        const normalizedValue = value.toLowerCase();
        const searchText = (filter.searchText || '').trim().toLowerCase();
        const selectedValues = filter.selectedValues || [];

        if (searchText && !normalizedValue.includes(searchText)) return false;
        if (selectedValues.length && !selectedValues.includes(value)) return false;
        return true;
      });
    });
  }, [rowsData.rows, columnFilters]);

  function parseFlexibleDate(value) {
    if (value === null || value === undefined) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();

    const text = String(value).trim();
    if (!text) return null;

    // Excel serial date.
    if (/^\d{5}(\.\d+)?$/.test(text)) {
      const serial = Number(text);
      if (Number.isFinite(serial)) {
        const excelEpoch = Date.UTC(1899, 11, 30);
        return excelEpoch + Math.floor(serial) * 24 * 60 * 60 * 1000;
      }
    }

    // Database / ISO date: yyyy-mm-dd, yyyy/mm/dd, yyyy.mm.dd, optional time.
    let match = text.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const hours = Number(match[4] || 0);
      const minutes = Number(match[5] || 0);
      const seconds = Number(match[6] || 0);
      const date = new Date(year, month - 1, day, hours, minutes, seconds);
      if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
        return date.getTime();
      }
      return null;
    }

    // Israeli date is ALWAYS day/month/year: dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, optional time.
    match = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (match) {
      const day = Number(match[1]);
      const month = Number(match[2]);
      let year = Number(match[3]);
      const hours = Number(match[4] || 0);
      const minutes = Number(match[5] || 0);
      const seconds = Number(match[6] || 0);
      if (year < 100) year += 2000;
      const date = new Date(year, month - 1, day, hours, minutes, seconds);
      if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
        return date.getTime();
      }
      return null;
    }

    return null;
  }

  function isDateColumn(fieldKey) {
    const column = tableColumns.find((item) => item.key === fieldKey);
    return column?.type === 'date' || /date|תאריך/i.test(column?.label || fieldKey || '');
  }

  function getSortValue(row, fieldKey) {
    const column = tableColumns.find((item) => item.key === fieldKey);
    if (column?.sortRawKey && row[column.sortRawKey] !== null && row[column.sortRawKey] !== undefined) {
      return row[column.sortRawKey];
    }
    return row[fieldKey] ?? row.custom_data?.[fieldKey] ?? '';
  }

  function compareColumnValues(aVal, bVal, fieldKey) {
    const aText = aVal === null || aVal === undefined ? '' : String(aVal).trim();
    const bText = bVal === null || bVal === undefined ? '' : String(bVal).trim();

    // Empty values always stay at the bottom, both in ascending and descending sorting.
    if (!aText && !bText) return 0;
    if (!aText) return 1;
    if (!bText) return -1;

    if (isDateColumn(fieldKey)) {
      const aDate = typeof aVal === 'number' ? aVal : parseFlexibleDate(aText);
      const bDate = typeof bVal === 'number' ? bVal : parseFlexibleDate(bText);
      if (aDate !== null && bDate !== null) return aDate - bDate;
      if (aDate !== null) return -1;
      if (bDate !== null) return 1;
    }

    const aNumber = Number(aText.replace(/,/g, ''));
    const bNumber = Number(bText.replace(/,/g, ''));
    if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) {
      return aNumber - bNumber;
    }

    return aText.localeCompare(bText, 'he', { numeric: true, sensitivity: 'base' });
  }

  const sortedRows = useMemo(() => {
    const rows = [...filteredRows];
    if (!sortConfig.key) return rows;

    return rows.sort((a, b) => {
      const aVal = getSortValue(a, sortConfig.key);
      const bVal = getSortValue(b, sortConfig.key);
      const result = compareColumnValues(aVal, bVal, sortConfig.key);

      if (result === 0) return 0;

      const aEmpty = !String(aVal ?? '').trim();
      const bEmpty = !String(bVal ?? '').trim();
      if (aEmpty || bEmpty) return result;

      return sortConfig.direction === 'asc' ? result : -result;
    });
  }, [filteredRows, sortConfig]);

  function handleSort(fieldKey) {
    setSortConfig((prev) => ({
      key: fieldKey,
      direction: prev.key === fieldKey && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  }

  function getUniqueColumnValues(fieldKey) {
    const values = rowsData.rows.map((row) => getColumnValue(row, fieldKey));
    return [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b, 'he', { numeric: true }));
  }

  function updateColumnFilter(fieldKey, nextFilter) {
    setColumnFilters((prev) => {
      const normalizedFilter = {
        searchText: nextFilter.searchText || '',
        selectedValues: nextFilter.selectedValues || []
      };
      const isEmpty = !normalizedFilter.searchText && !normalizedFilter.selectedValues.length;
      if (isEmpty) {
        const { [fieldKey]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [fieldKey]: normalizedFilter };
    });
  }

  function clearColumnFilter(fieldKey) {
    setColumnFilters((prev) => {
      const { [fieldKey]: _removed, ...rest } = prev;
      return rest;
    });
  }

  function clearAllColumnFilters() {
    setColumnFilters({});
    setSearch('');
    setStatus('');
  }

  function toggleFilterValue(fieldKey, value) {
    const current = columnFilters[fieldKey] || { searchText: '', selectedValues: [] };
    const selectedValues = current.selectedValues || [];
    const exists = selectedValues.includes(value);
    updateColumnFilter(fieldKey, {
      ...current,
      selectedValues: exists
        ? selectedValues.filter((item) => item !== value)
        : [...selectedValues, value]
    });
  }

  function renderExcelHeader(column) {
    const fieldKey = column.key;
    const label = column.label;
    const filter = columnFilters[fieldKey] || { searchText: '', selectedValues: [] };
    const hasFilter = Boolean(filter.searchText || filter.selectedValues.length);
    const isSorted = sortConfig.key === fieldKey;
    const uniqueValues = column.noFilter ? [] : getUniqueColumnValues(fieldKey);

    return (
      <th
        key={fieldKey}
        className={`excel-filter-th draggable-column-th ${hasFilter ? 'filtered' : ''} ${draggedColumnKey === fieldKey ? 'dragging' : ''}`}
        draggable
        onDragStart={(e) => {
          setDraggedColumnKey(fieldKey);
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', fieldKey);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }}
        onDrop={(e) => {
          e.preventDefault();
          const fromKey = e.dataTransfer.getData('text/plain') || draggedColumnKey;
          moveColumn(fromKey, fieldKey);
          setDraggedColumnKey(null);
        }}
        onDragEnd={() => setDraggedColumnKey(null)}
        title="אפשר לגרור את הכותרת כדי לשנות סדר עמודות"
      >
        {column.noFilter ? (
          <div className="excel-filter-trigger column-drag-handle">
            <span>{label}</span>
            <span className="excel-filter-icons">↔</span>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="excel-filter-trigger column-drag-handle"
              onClick={() => setOpenFilterKey((prev) => (prev === fieldKey ? null : fieldKey))}
              title={`סינון, מיון וגרירה לפי ${label}`}
            >
              <span>{label}</span>
              <span className="excel-filter-icons">
                {isSorted ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                {hasFilter ? '●' : '▾'}
              </span>
            </button>

            {openFilterKey === fieldKey && (
              <div className="excel-filter-panel" ref={filterPanelRef} draggable={false}>
                <div className="excel-filter-title">{label}</div>

                <div className="excel-filter-sort-row">
                  <button type="button" onClick={() => { setSortConfig({ key: fieldKey, direction: 'asc' }); setOpenFilterKey(null); }}>
                    מיין עולה ▲
                  </button>
                  <button type="button" onClick={() => { setSortConfig({ key: fieldKey, direction: 'desc' }); setOpenFilterKey(null); }}>
                    מיין יורד ▼
                  </button>
                </div>

                <input
                  className="excel-filter-search"
                  value={filter.searchText}
                  onChange={(e) => updateColumnFilter(fieldKey, { ...filter, searchText: e.target.value })}
                  placeholder="חיפוש בתוך העמודה..."
                  autoFocus
                />

                <div className="excel-filter-values">
                  {uniqueValues.length ? uniqueValues.map((value) => (
                    <label key={value} className="excel-filter-check">
                      <input
                        type="checkbox"
                        checked={filter.selectedValues.includes(value)}
                        onChange={() => toggleFilterValue(fieldKey, value)}
                      />
                      <span>{value}</span>
                    </label>
                  )) : (
                    <div className="excel-filter-empty">אין ערכים לבחירה</div>
                  )}
                </div>

                <div className="excel-filter-actions">
                  <button type="button" onClick={() => clearColumnFilter(fieldKey)}>נקה עמודה</button>
                  <button type="button" className="primary-mini" onClick={() => setOpenFilterKey(null)}>סגור</button>
                </div>
              </div>
            )}
          </>
        )}
      </th>
    );
  }

  function updateCustomField(fieldKey, value) {
    setForm((prev) => ({
      ...prev,
      custom_data: {
        ...(prev.custom_data || {}),
        [fieldKey]: value
      }
    }));
  }

  async function reloadProjectFields() {
    if (!selectedProject?.id) return;
    const result = await api.getProjectFields(selectedProject.id);
    setCustomFields(result.customFields || []);
  }

  function renderTableCell(row, column) {
    if (column.type === 'actions') {
      return (
        <td key={`${row.id}-${column.key}`}>
          <div className="row-actions">
            <button
              type="button"
              onClick={() => { setShowRowEditor(true); startEdit(row); }}
            >
              ערוך
            </button>

            {user.role === 'admin' && (
              <button
                type="button"
                className="danger"
                onClick={() => deleteRow(row.id)}
              >
                מחק
              </button>
            )}
          </div>
        </td>
      );
    }

    if (column.key === 'status_label') {
      return (
        <td key={`${row.id}-${column.key}`}>
          <span className={`status ${row.status}`}>
            {row.status_label}
          </span>
        </td>
      );
    }

    const value = column.isCustom
      ? row.custom_data?.[column.key] ?? ''
      : row[column.key] ?? '';

    return (
      <td key={`${row.id}-${column.key}`} className={column.key === 'serial_number' ? 'serial-cell' : ''}>
        {value}
      </td>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar card glass-card">
        <div className="sidebar-header">
          <div className="section-chip">Navigate</div>
          <h1>פרויקטים</h1>
          <p>בחר פרויקט ועבור בין הנושאים בדפים נפרדים.</p>
        </div>

        <div className="sidebar-nav-actions">
          <button
            type="button"
            className="secondary-btn"
            onClick={goToProjects}
          >
            חזרה לדף פרויקטים
          </button>

          <button
            type="button"
            className="settings-btn-pro"
            onClick={openSettings}
          >
            הגדרות
          </button>
        </div>

        <div className="project-list">
          {loadingProjects ? (
            <div className="empty-sidebar-state">טוען...</div>
          ) : projects.length ? (
            projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={`project-item ${project.id === selectedProject?.id ? 'active' : ''}`}
                onClick={() => setSelectedProject(project.id)}
              >
                <div className="project-item-title">{project.name}</div>
                <div className="project-item-meta">
                  <span>{project.rows_count || 0} שורות</span>
                  {project.description ? <small>{project.description}</small> : null}
                </div>
              </button>
            ))
          ) : (
            <div className="empty-sidebar-state">אין פרויקטים</div>
          )}
        </div>
      </aside>

      <main className="main-panel">
        <section className="hero-with-brand">
          <section className="toolbar card glass-card hero-toolbar">
            <div>
              <div className="section-chip">Rows Management</div>
              <h2>{selectedProject?.name || 'בחר פרויקט'}</h2>
              <p>
                {selectedProject?.description || 'ניהול שורות, טפסים, חיפוש ופעולות מהירות.'}
              </p>
            </div>

            <div className="toolbar-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={goToImport}
              >
                ייבוא Pro
              </button>

              <button
                type="button"
                className="secondary-btn"
                onClick={handleExport}
              >
                ייצוא אקסל
              </button>
            </div>
          </section>

          <AppBrand />
        </section>

        <section className="project-summary-grid rows-summary-compact">
          <div className="glass-card rows-summary-card">
            <ProjectClock
              total={projectSummary.rows_count}
              completed={projectSummary.completed_rows}
              pending={projectSummary.pending_rows}
              size={116}
              stroke={11}
              title="גרף שעון"
            />

            <div className="rows-summary-numbers">
              <div>
                <span>סה״כ פרויקטים</span>
                <strong>{totalProjects}</strong>
              </div>
              <div>
                <span>שורות בפרויקט</span>
                <strong>{projectSummary.rows_count || 0}</strong>
              </div>
              <div>
                <span>שורות מוצגות</span>
                <strong>{sortedRows.length}</strong>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="glass-card add-row-tile"
            onClick={() => {
              resetForm();
              setShowRowEditor((prev) => !prev);
            }}
          >
            <span className="add-row-plus">+</span>
            <strong>{showRowEditor && !editingRowId ? 'סגור הוספת שורה' : 'הוספת שורה'}</strong>
            <small>פתח טופס הוספת שורה חדשה לפרויקט</small>
          </button>
        </section>

        <section className={`content-grid rows-main-layout ${showRowEditor || editingRowId ? 'editor-open' : ''}`}>
          {(showRowEditor || editingRowId) && (
          <section className="card form-card glass-card">
            <div className="card-title-row">
              <div>
                <div className="section-chip">Editor</div>
                <h3>{editingRowId ? 'עריכת שורה' : 'הוספת שורה'}</h3>
              </div>
            </div>

            <ProjectFieldsManager
              projectId={selectedProject?.id}
              customFields={sortedCustomFields}
              onChanged={reloadProjectFields}
              canManage={user.role === 'admin' || user.role === 'manager'}
            />

            <form className="row-form" onSubmit={saveRow}>
              <LookupInput
                label="לקוח"
                value={form.customer_name}
                onChange={(value) => updateForm('customer_name', value)}
                loadOptions={api.getCustomers}
                onCreate={api.createCustomer}
                placeholder="חפש או הוסף לקוח"
              />

              <label className="field">
                <span>שם סניף</span>
                <input
                  value={form.branch_name}
                  onChange={(e) => updateForm('branch_name', e.target.value)}
                />
              </label>

              <label className="field">
                <span>מספר סניף</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  value={form.branch_number || ''}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      branch_number: e.target.value.replace(/\D/g, '').slice(0, 5)
                    }))
                  }
                />
              </label>

              <label className="field">
                <span>מספר עמדה</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  value={form.position_number || ''}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      position_number: e.target.value.replace(/\D/g, '').slice(0, 5)
                    }))
                  }
                />
              </label>

              <label className="field">
                <span>מספר סידורי *</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={8}
                  value={form.serial_number || ''}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      serial_number: e.target.value.replace(/\D/g, '').slice(0, 8)
                    }))
                  }
                />
              </label>

              <LookupInput
                label="שם מתקין"
                required={form.status === 'completed'}
                value={form.installer_name}
                onChange={(value) => updateForm('installer_name', value)}
                loadOptions={api.getInstallers}
                onCreate={api.createInstaller}
                placeholder="חפש או הוסף מתקין"
              />

              <label className="field">
                <span>תאריך יעד</span>
                <input
                  value={form.target_date}
                  placeholder="DD/MM/YYYY"
                  onChange={(e) => updateForm('target_date', e.target.value)}
                />
              </label>

              <label className="field">
                <span>תאריך ביצוע</span>
                <input
                  value={form.completed_date}
                  placeholder="DD/MM/YYYY"
                  onChange={(e) => updateForm('completed_date', e.target.value)}
                />
              </label>

              <label className="field">
                <span>סטטוס</span>
                <select
                  value={form.status}
                  onChange={(e) => updateForm('status', e.target.value)}
                >
                  {statusOptions.map((item) => (
                    <option key={item.status_key} value={item.status_key}>{item.label}</option>
                  ))}
                </select>
              </label>

              {sortedCustomFields.map((field) => (
                <CustomFieldInput
                  key={field.id}
                  field={field}
                  value={form.custom_data?.[field.field_key] ?? ''}
                  onChange={(value) => updateCustomField(field.field_key, value)}
                />
              ))}

              <div className="segmented-status">
                {statusOptions.map((item) => (
                  <button
                    key={item.status_key}
                    type="button"
                    className={form.status === item.status_key ? 'active' : ''}
                    onClick={() => updateForm('status', item.status_key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="form-actions">
                <button type="submit" className="primary-btn">
                  {editingRowId ? 'שמור שינויים' : 'הוסף שורה'}
                </button>

                {editingRowId && (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={resetForm}
                  >
                    ביטול
                  </button>
                )}
              </div>
            </form>

            {error && <div className="error-box">{error}</div>}
          </section>
          )}

          <section className="card table-card glass-card">
            <div className="card-title-row table-top-pro">
              <div>
                <div className="section-chip">Main Table Pro</div>
                <h3>טבלת שורות</h3>
              </div>

              <div className="toolbar-actions">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="חיפוש חכם..."
                />

                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">כל הסטטוסים</option>
                  {statusOptions.map((item) => (
                    <option key={item.status_key} value={item.status_key}>{item.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="table-meta">
              <strong>{sortedRows.length} מתוך {rowsData.total} שורות</strong>

              <button
                type="button"
                className="secondary-btn compact-btn"
                onClick={clearAllColumnFilters}
                disabled={!Object.keys(columnFilters).length && !search && !status}
              >
                נקה סינונים
              </button>

              <button
                type="button"
                className="secondary-btn compact-btn"
                onClick={resetColumnOrder}
              >
                איפוס עמודות
              </button>

              <div className="pagination">
                <button
                  type="button"
                  disabled={rowsData.page <= 1}
                  onClick={() => loadRows(selectedProject?.id, rowsData.page - 1)}
                >
                  הקודם
                </button>

                <span>עמוד {rowsData.page}</span>

                <button
                  type="button"
                  disabled={rowsData.page * rowsData.pageSize >= rowsData.total}
                  onClick={() => loadRows(selectedProject?.id, rowsData.page + 1)}
                >
                  הבא
                </button>
              </div>
            </div>

            <div className="table-wrap pro-table-wrap">
              <table>
                <thead>
                  <tr>
                    {orderedColumns.map((column) => renderExcelHeader(column))}
                  </tr>
                </thead>

                <tbody>
                  {loadingRows ? (
                    <tr>
                      <td colSpan={orderedColumns.length} className="empty">
                        טוען...
                      </td>
                    </tr>
                  ) : sortedRows.length ? (
                    sortedRows.map((row) => (
                      <tr key={row.id} className="data-row">
                        {orderedColumns.map((column) => renderTableCell(row, column))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={orderedColumns.length} className="empty">
                        אין נתונים להצגה
                      </td>
                    </tr>
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