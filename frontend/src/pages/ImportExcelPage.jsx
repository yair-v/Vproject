import { useMemo, useState } from 'react';
import { api } from '../api';

const FIELD_DEFS = [
    { key: 'customer_name', label: 'לקוח', required: false },
    { key: 'branch_name', label: 'שם סניף', required: false },
    { key: 'branch_number', label: 'מספר סניף', required: false },
    { key: 'position_number', label: 'מספר עמדה', required: false },
    { key: 'serial_number', label: 'מספר סידורי', required: true },
    { key: 'installer_name', label: 'שם מתקין', required: false },
    { key: 'target_date', label: 'תאריך יעד', required: false },
    { key: 'completed_date', label: 'תאריך ביצוע', required: false },
    { key: 'status', label: 'סטטוס', required: false }
];

function normalize(value) {
    return String(value ?? '').trim();
}

function validatePreviewRow(mappedRow) {
    const errors = [];

    const serial = normalize(mappedRow.serial_number);
    const branchNumber = normalize(mappedRow.branch_number);
    const positionNumber = normalize(mappedRow.position_number);
    const installerName = normalize(mappedRow.installer_name);
    const status = normalize(mappedRow.status).toLowerCase();

    if (!serial) {
        errors.push('חסר מספר סידורי');
    } else if (!/^\d{8}$/.test(serial)) {
        errors.push('מספר סידורי חייב להיות 8 ספרות');
    }

    if (branchNumber && !/^\d{1,5}$/.test(branchNumber)) {
        errors.push('מספר סניף חייב להיות מספר עד 5 ספרות');
    }

    if (positionNumber && !/^\d{1,5}$/.test(positionNumber)) {
        errors.push('מספר עמדה חייב להיות מספר עד 5 ספרות');
    }

    const isCompleted =
        status === 'completed' ||
        status === 'בוצע';

    if (isCompleted && !installerName) {
        errors.push('בסטטוס בוצע חייב שם מתקין');
    }

    return errors;
}

export default function ImportExcelPage({ projectId, projectName, onBack, onImported }) {
    const [fileName, setFileName] = useState('');
    const [headers, setHeaders] = useState([]);
    const [allRows, setAllRows] = useState([]);
    const [mapping, setMapping] = useState({});
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState('');
    const [lastResult, setLastResult] = useState(null);

    async function handleFileChange(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setError('');
        setLastResult(null);

        try {
            const result = await api.previewImport(file);
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

    function updateMapping(fieldKey, columnName) {
        setMapping((prev) => ({
            ...prev,
            [fieldKey]: columnName
        }));
    }

    const previewRows = useMemo(() => {
        return allRows.slice(0, 20).map((rawRow, index) => {
            const mappedRow = {};
            FIELD_DEFS.forEach((field) => {
                const sourceColumn = mapping[field.key];
                mappedRow[field.key] = sourceColumn ? rawRow[sourceColumn] ?? '' : '';
            });

            const errors = validatePreviewRow(mappedRow);

            return {
                index: index + 1,
                mappedRow,
                errors
            };
        });
    }, [allRows, mapping]);

    const mappedCount = useMemo(() => {
        return FIELD_DEFS.filter((field) => mapping[field.key]).length;
    }, [mapping]);

    const invalidPreviewCount = useMemo(() => {
        return previewRows.filter((row) => row.errors.length > 0).length;
    }, [previewRows]);

    async function handleImport() {
        if (!projectId) return;

        if (!allRows.length) {
            setError('אין נתונים לייבוא');
            return;
        }

        if (!mapping.serial_number) {
            setError('חובה למפות את השדה "מספר סידורי" לפני הייבוא');
            return;
        }

        setImporting(true);
        setError('');
        setLastResult(null);

        try {
            const result = await api.importMappedRows(projectId, {
                mapping,
                rows: allRows
            });

            setLastResult(result);

            if (typeof onImported === 'function') {
                onImported();
            }
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
                    <section className="import-hero-card">
                        <div className="section-chip">Import Pro</div>
                        <h1>ייבוא אקסל מתקדם</h1>
                        <p>
                            פרויקט: <strong>{projectName || `#${projectId}`}</strong>
                        </p>

                        <div className="import-hero-actions">
                            <button type="button" className="secondary-btn" onClick={onBack}>
                                חזרה למערכת
                            </button>

                            <label className="primary-btn upload-btn">
                                בחר קובץ אקסל
                                <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} hidden />
                            </label>
                        </div>

                        {fileName ? <div className="import-file-badge">{fileName}</div> : null}
                        {error ? <div className="error-box">{error}</div> : null}
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
                                    <strong>{mappedCount}/{FIELD_DEFS.length}</strong>
                                </div>
                                <div className="glass-card stat-box">
                                    <span>שורות עם שגיאות בתצוגה</span>
                                    <strong>{invalidPreviewCount}</strong>
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
                                    {FIELD_DEFS.map((field) => (
                                        <label key={field.key} className="field pro-field">
                                            <span>
                                                {field.label}
                                                {field.required ? ' *' : ''}
                                            </span>

                                            <select
                                                value={mapping[field.key] || ''}
                                                onChange={(e) => updateMapping(field.key, e.target.value)}
                                            >
                                                <option value="">לא ממופה</option>
                                                {headers.map((header) => (
                                                    <option key={header} value={header}>
                                                        {header}
                                                    </option>
                                                ))}
                                            </select>
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
                                                {FIELD_DEFS.map((field) => (
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
                                                    {FIELD_DEFS.map((field) => (
                                                        <td key={field.key}>{String(row.mappedRow[field.key] ?? '')}</td>
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

                            {lastResult && (
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
                                            <span>שגיאות</span>
                                            <strong>{lastResult.errors?.length || 0}</strong>
                                        </div>
                                    </div>

                                    {lastResult.errors?.length ? (
                                        <div className="iphone-table-wrap">
                                            <table>
                                                <thead>
                                                    <tr>
                                                        <th>שורה</th>
                                                        <th>שגיאה</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {lastResult.errors.map((item, index) => (
                                                        <tr key={`${item.row}-${index}`}>
                                                            <td>{item.row}</td>
                                                            <td>{item.error}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="success-box">הייבוא הסתיים ללא שגיאות.</div>
                                    )}
                                </section>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}