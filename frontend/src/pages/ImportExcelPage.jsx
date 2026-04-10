import { useMemo, useState } from 'react';
import { api } from '../api';

const FIELD_DEFS = [
    { key: 'customer_name', label: 'לקוח' },
    { key: 'branch_name', label: 'שם סניף' },
    { key: 'branch_number', label: 'מספר סניף' },
    { key: 'position_number', label: 'מספר עמדה' },
    { key: 'serial_number', label: 'מספר סידורי' },
    { key: 'installer_name', label: 'שם מתקין' },
    { key: 'target_date', label: 'תאריך יעד' },
    { key: 'completed_date', label: 'תאריך ביצוע' },
    { key: 'status', label: 'סטטוס' }
];

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
            return {
                index: index + 1,
                mappedRow
            };
        });
    }, [allRows, mapping]);

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
        <div className="app-shell import-page-shell">
            <main className="main-panel import-main-panel">
                <section className="toolbar card">
                    <div>
                        <h2>ייבוא אקסל מתקדם</h2>
                        <p>
                            פרויקט: <strong>{projectName || `#${projectId}`}</strong>
                        </p>
                    </div>
                    <div className="toolbar-actions">
                        <button type="button" className="secondary" onClick={onBack}>חזרה למערכת</button>
                    </div>
                </section>

                <section className="card form-card">
                    <h3>בחירת קובץ</h3>

                    <div className="import-upload-row">
                        <label className="file-button">
                            בחר קובץ אקסל
                            <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} hidden />
                        </label>
                        {fileName && <span className="import-file-name">{fileName}</span>}
                    </div>

                    {loading && <div className="empty">טוען תצוגה מקדימה...</div>}
                    {error && <div className="error-box">{error}</div>}

                    {!!headers.length && (
                        <>
                            <div className="import-summary">
                                <strong>סה״כ שורות בקובץ: {allRows.length}</strong>
                                <span>תצוגה מקדימה מוצגת על 20 שורות ראשונות ומתעדכנת בזמן אמת.</span>
                            </div>

                            <h3>מיפוי עמודות</h3>
                            <div className="mapping-grid">
                                {FIELD_DEFS.map((field) => (
                                    <label key={field.key} className="field">
                                        <span>{field.label}</span>
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

                            <h3>תצוגה מקדימה חיה</h3>
                            <div className="table-wrap">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            {FIELD_DEFS.map((field) => (
                                                <th key={field.key}>{field.label}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewRows.map((row) => (
                                            <tr key={row.index}>
                                                <td>{row.index}</td>
                                                {FIELD_DEFS.map((field) => (
                                                    <td key={field.key}>{String(row.mappedRow[field.key] ?? '')}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="form-actions">
                                <button type="button" onClick={handleImport} disabled={importing}>
                                    {importing ? 'מייבא...' : 'ייבא לפרויקט'}
                                </button>
                            </div>

                            {lastResult && (
                                <div className="card import-result-card">
                                    <h3>תוצאת ייבוא</h3>
                                    <p>נוספו {lastResult.inserted} שורות.</p>

                                    {lastResult.errors?.length ? (
                                        <>
                                            <p>נמצאו {lastResult.errors.length} שגיאות:</p>
                                            <div className="table-wrap">
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
                                        </>
                                    ) : (
                                        <div className="empty">לא נמצאו שגיאות.</div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </section>
            </main>
        </div>
    );
}