import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import AppBrand from '../components/AppBrand';
import SmartSelect from '../components/SmartSelect';

const BASE_FIELD_DEFS = [
  { key: 'customer_name', label: 'לקוח', required: false, field_type: 'text', is_base: true },
  { key: 'branch_name', label: 'שם סניף', required: false, field_type: 'text', is_base: true },
  { key: 'branch_number', label: 'מספר סניף', required: false, field_type: 'number', is_base: true },
  { key: 'position_number', label: 'מספר עמדה', required: false, field_type: 'number', is_base: true },
  { key: 'serial_number', label: 'מספר סידורי', required: true, field_type: 'number', is_base: true },
  { key: 'installer_name', label: 'שם מתקין', required: false, field_type: 'text', is_base: true },
  { key: 'target_date', label: 'תאריך יעד', required: false, field_type: 'date', is_base: true },
  { key: 'completed_date', label: 'תאריך ביצוע', required: false, field_type: 'date', is_base: true },
  { key: 'status', label: 'סטטוס', required: false, field_type: 'select', is_base: true }
];

function normalize(value) {
  return String(value ?? '').trim();
}

function displayDate(value) {
  if (!value && value !== 0) return '';
  const str = String(value).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [yyyy, mm, dd] = str.split('-');
    return `${dd}/${mm}/${yyyy}`;
  }
  return str;
}

function validatePreviewRow(mappedRow, fieldDefs) {
  const errors = [];
  const serial = normalize(mappedRow.serial_number);
  const branchNumber = normalize(mappedRow.branch_number);
  const positionNumber = normalize(mappedRow.position_number);
  const installerName = normalize(mappedRow.installer_name);
  const status = normalize(mappedRow.status).toLowerCase();

  if (!serial) errors.push('חסר מספר סידורי');
  else if (!/^\d{8}$/.test(serial)) errors.push('מספר סידורי חייב להיות 8 ספרות');

  if (branchNumber && !/^\d{1,5}$/.test(branchNumber)) {
    errors.push('מספר סניף חייב להיות מספר עד 5 ספרות');
  }

  if (positionNumber && !/^\d{1,5}$/.test(positionNumber)) {
    errors.push('מספר עמדה חייב להיות מספר עד 5 ספרות');
  }

  if ((status === 'completed' || status === 'בוצע') && !installerName) {
    errors.push('בסטטוס בוצע חייב שם מתקין');
  }

  for (const field of fieldDefs) {
    const value = mappedRow[field.key];
    if (field.required && normalize(value) === '') {
      errors.push(`השדה "${field.label}" הוא שדה חובה`);
    }
  }

  return errors;
}

function safeJsonPreview(value) {
  if (!value || typeof value !== 'object') return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

export default function ImportExcelPage({ projectId, projectName, onBack }) {
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [allRows, setAllRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState(null);
  const [customFields, setCustomFields] = useState([]);

  const allFieldDefs = useMemo(() => {
    return [...BASE_FIELD_DEFS, ...customFields];
  }, [customFields]);

  useEffect(() => {
    async function loadFields() {
      if (!projectId) return;
      try {
        const result = await api.getProjectFields(projectId);
        setCustomFields(
          (result.customFields || []).map((field) => ({
            key: field.field_key,
            label: field.field_label,
            required: !!field.is_required,
            field_type: field.field_type,
            options: field.options || [],
            is_base: false
          }))
        );
      } catch {
        setCustomFields([]);
      }
    }

    loadFields();
  }, [projectId]);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError('');
    setLastResult(null);

    try {
      const result = await api.previewImport(projectId, file);
      setFileName(file.name);
      setHeaders(result.headers || []);
      setAllRows(result.rows || []);
      setMapping(result.autoMapping || {});
    } catch (err) {
      setError(err.message);
      setFileName('');
      setHeaders([]);
      setAllRows([]);
      setMapping({});
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  }

  const previewRows = useMemo(() => {
    return allRows.slice(0, 20).map((rawRow, index) => {
      const mappedRow = {};

      allFieldDefs.forEach((field) => {
        const sourceColumn = mapping[field.key];
        const rawValue = sourceColumn ? rawRow[sourceColumn] ?? '' : '';
        mappedRow[field.key] = field.field_type === 'date' ? displayDate(rawValue) : rawValue;
      });

      return {
        index: index + 1,
        mappedRow,
        errors: validatePreviewRow(mappedRow, allFieldDefs)
      };
    });
  }, [allRows, mapping, allFieldDefs]);

  async function handleImport() {
    if (!mapping.serial_number) {
      setError('חובה למפות את השדה "מספר סידורי" לפני הייבוא');
      return;
    }

    setImporting(true);
    setError('');

    try {
      const result = await api.importMappedRows(projectId, {
        mapping,
        rows: allRows
      });
      setLastResult(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="import-screen">
      <div className="import-phone-frame">
        <div className="import-phone-topbar">
          <div className="iphone-pill" />
        </div>

        <div className="import-phone-content">
          <section className="hero-with-brand hero-with-brand-import">
            <section className="import-hero-card">
              <div className="section-chip">Import Pro</div>
              <h1>ייבוא אקסל מתקדם</h1>
              <p>פרויקט: <strong>{projectName || `#${projectId}`}</strong></p>

              <div className="import-hero-actions">
                <button type="button" className="secondary-btn" onClick={onBack}>
                  חזרה לדף שורות
                </button>

                <label className="primary-btn upload-btn">
                  בחר קובץ אקסל
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                    hidden
                  />
                </label>
              </div>

              {fileName ? <div className="import-file-badge">{fileName}</div> : null}
              {error ? <div className="error-box">{error}</div> : null}
            </section>

            <AppBrand />
          </section>

          {loading ? (
            <section className="glass-card import-status-card">
              <div className="loading-spinner" />
              <div>קורא את הקובץ ובונה תצוגה מקדימה...</div>
            </section>
          ) : null}

          {!!headers.length && (
            <>
              <section className="import-stats-grid">
                <div className="glass-card stat-box">
                  <span>סה״כ שורות</span>
                  <strong>{allRows.length}</strong>
                </div>

                <div className="glass-card stat-box">
                  <span>שדות שמופו</span>
                  <strong>
                    {allFieldDefs.filter((field) => mapping[field.key]).length}/{allFieldDefs.length}
                  </strong>
                </div>

                <div className="glass-card stat-box">
                  <span>שורות עם שגיאות</span>
                  <strong>{previewRows.filter((row) => row.errors.length > 0).length}</strong>
                </div>
              </section>

              <section className="glass-card import-mapping-card">
                <div className="card-title-row">
                  <div>
                    <div className="section-chip">Mapping</div>
                    <h3>מיפוי עמודות</h3>
                  </div>
                </div>

                <div className="mapping-grid pro-mapping-grid">
                  {allFieldDefs.map((field) => (
                    <label key={field.key} className="field pro-field">
                      <span>
                        {field.label}
                        {field.required ? ' *' : ''}
                        {!field.is_base ? ' (מותאם)' : ''}
                      </span>

                      <SmartSelect
                        value={mapping[field.key] || ''}
                        onChange={(selectedHeader) =>
                          setMapping((prev) => ({
                            ...prev,
                            [field.key]: selectedHeader
                          }))
                        }
                        options={['', ...headers].filter(Boolean)}
                        placeholder="לא ממופה"
                        searchPlaceholder="חפש כותרת..."
                        emptyText="אין כותרות"
                      />
                    </label>
                  ))}
                </div>
              </section>

              <section className="glass-card import-preview-card">
                <div className="card-title-row">
                  <div>
                    <div className="section-chip">Preview</div>
                    <h3>תצוגה מקדימה חיה</h3>
                  </div>
                  <div className="preview-note">20 שורות ראשונות</div>
                </div>

                <div className="iphone-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        {allFieldDefs.map((field) => (
                          <th key={field.key}>{field.label}</th>
                        ))}
                        <th>שגיאות</th>
                      </tr>
                    </thead>

                    <tbody>
                      {previewRows.map((row) => (
                        <tr
                          key={row.index}
                          className={row.errors.length ? 'preview-row-error' : 'preview-row-ok'}
                        >
                          <td>{row.index}</td>

                          {allFieldDefs.map((field) => (
                            <td key={field.key}>
                              {String(row.mappedRow[field.key] ?? '')}
                            </td>
                          ))}

                          <td>
                            {row.errors.length ? (
                              <div className="row-error-list">
                                {row.errors.map((item, idx) => (
                                  <span key={idx} className="error-pill">{item}</span>
                                ))}
                              </div>
                            ) : (
                              <span className="ok-pill">תקין</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="form-actions import-bottom-actions">
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={handleImport}
                    disabled={importing}
                  >
                    {importing ? 'מייבא...' : 'ייבא לפרויקט'}
                  </button>
                </div>
              </section>

              {lastResult ? (
                <>
                  <section className="glass-card import-result-card">
                    <div className="card-title-row">
                      <div>
                        <div className="section-chip">Result</div>
                        <h3>תוצאת ייבוא</h3>
                      </div>
                    </div>

                    <div className="import-result-summary">
                      <div className="stat-box compact">
                        <span>נוספו</span>
                        <strong>{lastResult.inserted}</strong>
                      </div>
                      <div className="stat-box compact">
                        <span>נכשלו</span>
                        <strong>{lastResult.errors?.length || 0}</strong>
                      </div>
                    </div>
                  </section>

                  {!!lastResult.errors?.length && (
                    <section className="glass-card import-result-card">
                      <div className="card-title-row">
                        <div>
                          <div className="section-chip">Import Errors</div>
                          <h3>שורות שלא יובאו</h3>
                        </div>
                      </div>

                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>שורה בקובץ</th>
                              <th>סיבת שגיאה</th>
                              <th>נתונים מקוריים</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lastResult.errors.map((item, index) => (
                              <tr key={`${item.row}-${index}`}>
                                <td>{item.row}</td>
                                <td>{item.error}</td>
                                <td>
                                  <pre className="import-error-json">
                                    {safeJsonPreview(item.rawRow)}
                                  </pre>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}