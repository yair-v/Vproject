import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import SmartSelect from './SmartSelect';

const TYPE_OPTIONS = [
  { value: 'text', label: 'טקסט' },
  { value: 'number', label: 'מספר' },
  { value: 'date', label: 'תאריך' },
  { value: 'select', label: 'רשימת בחירה' },
  { value: 'boolean', label: 'כן / לא' }
];

function emptyField(nextOrder = 0) {
  return {
    field_label: '',
    field_type: 'text',
    is_required: false,
    options_text: '',
    sort_order: nextOrder
  };
}

export default function ProjectFieldsManager({
  projectId,
  customFields,
  onChanged,
  canManage = true
}) {
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [draft, setDraft] = useState(emptyField(customFields.length));
  const [saving, setSaving] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const sortedFields = useMemo(() => {
    return [...customFields].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id
    );
  }, [customFields]);

  function openCreateModal() {
    setEditingField(null);
    setDraft(emptyField(sortedFields.length));
    setModalOpen(true);
    setError('');
  }

  function openEditModal(field) {
    setEditingField(field);
    setDraft({
      field_label: field.field_label || '',
      field_type: field.field_type || 'text',
      is_required: Boolean(field.is_required),
      options_text: Array.isArray(field.options) ? field.options.join(', ') : '',
      sort_order: Number(field.sort_order ?? 0)
    });
    setModalOpen(true);
    setError('');
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
  }

  async function updateField(field, patch) {
    try {
      setError('');
      await api.updateProjectField(projectId, field.id, {
        field_label: patch.field_label ?? field.field_label,
        field_type: patch.field_type ?? field.field_type,
        is_required: patch.is_required ?? field.is_required,
        options: patch.options_text ?? (field.options || []).join(', '),
        sort_order: patch.sort_order ?? field.sort_order,
        is_active: true
      });
      await onChanged();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  async function saveModal() {
    if (!draft.field_label.trim()) {
      setError('שם שדה הוא חובה');
      return;
    }

    if (draft.field_type === 'select' && !draft.options_text.trim()) {
      setError('בשדה מסוג רשימת בחירה צריך להכניס אפשרויות');
      return;
    }

    setSaving(true);

    try {
      setError('');

      if (editingField) {
        await updateField(editingField, draft);
      } else {
        await api.createProjectField(projectId, {
          field_label: draft.field_label,
          field_type: draft.field_type,
          is_required: draft.is_required,
          options: draft.options_text,
          sort_order: draft.sort_order
        });
        await onChanged();
      }

      setModalOpen(false);
      setEditingField(null);
      setDraft(emptyField(sortedFields.length));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeField(field) {
    if (!window.confirm(`למחוק את השדה "${field.field_label}"?`)) return;

    try {
      setError('');
      await api.deleteProjectField(projectId, field.id);
      await onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleRequired(field) {
    await updateField(field, { is_required: !field.is_required });
  }

  async function reorderFields(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return;

    const current = [...sortedFields];
    const fromIndex = current.findIndex((item) => item.id === sourceId);
    const toIndex = current.findIndex((item) => item.id === targetId);

    if (fromIndex === -1 || toIndex === -1) return;

    const [moved] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, moved);

    try {
      setError('');

      for (let index = 0; index < current.length; index += 1) {
        const field = current[index];
        const nextOrder = index;

        if ((field.sort_order ?? 0) !== nextOrder) {
          await api.updateProjectField(projectId, field.id, {
            field_label: field.field_label,
            field_type: field.field_type,
            is_required: field.is_required,
            options: (field.options || []).join(', '),
            sort_order: nextOrder,
            is_active: true
          });
        }
      }

      await onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="inline-fields-manager">
        <div className="inline-fields-header">
          <div>
            <div className="section-chip">Project Fields</div>
            <h3>סידור שדות לפרויקט</h3>
            <p className="project-fields-note">
              גרור כדי לשנות סדר. השדות יוצגו בטופס בדיוק לפי הסדר שתבחר.
            </p>
          </div>

          <div className="toolbar-actions">
            <span className="rows-badge">שדות בסיס נעולים</span>
            {canManage && (
              <button
                type="button"
                className="primary-btn"
                onClick={openCreateModal}
              >
                הוסף שדה
              </button>
            )}
          </div>
        </div>

        {error && <div className="error-box">{error}</div>}

        <div className="inline-fields-list">
          {sortedFields.length ? (
            sortedFields.map((field) => (
              <div
                key={field.id}
                className={[
                  'inline-field-chip',
                  draggingId === field.id ? 'dragging' : '',
                  dragOverId === field.id ? 'drag-over' : ''
                ].join(' ')}
                draggable={canManage}
                onDragStart={() => setDraggingId(field.id)}
                onDragOver={(event) => {
                  if (!canManage) return;
                  event.preventDefault();
                  setDragOverId(field.id);
                }}
                onDragLeave={() => {
                  if (dragOverId === field.id) setDragOverId(null);
                }}
                onDrop={async (event) => {
                  event.preventDefault();
                  const sourceId = draggingId;
                  const targetId = field.id;
                  setDragOverId(null);
                  setDraggingId(null);
                  await reorderFields(sourceId, targetId);
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDragOverId(null);
                }}
              >
                <button
                  type="button"
                  className="drag-handle-btn"
                  title="גרור כדי לשנות סדר"
                >
                  ⋮⋮
                </button>

                <div className="inline-field-chip-main">
                  <strong>{field.field_label}</strong>
                  <span>
                    {TYPE_OPTIONS.find((item) => item.value === field.field_type)?.label || field.field_type}
                    {field.is_required ? ' • חובה' : ''}
                  </span>
                </div>

                {canManage && (
                  <div className="inline-field-chip-actions">
                    <button
                      type="button"
                      onClick={() => openEditModal(field)}
                    >
                      ערוך
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleRequired(field)}
                    >
                      {field.is_required ? 'בטל חובה' : 'חובה'}
                    </button>

                    <button
                      type="button"
                      className="danger"
                      onClick={() => removeField(field)}
                    >
                      מחק
                    </button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="empty inline-fields-empty">
              אין עדיין שדות מותאמים לפרויקט
            </div>
          )}
        </div>
      </div>

      {modalOpen &&
        createPortal(
          <div className="field-modal-backdrop" onClick={closeModal}>
            <div
              className="field-modal card glass-card"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="field-modal-header">
                <div>
                  <div className="section-chip">
                    {editingField ? 'Edit Field' : 'New Field'}
                  </div>
                  <h3>{editingField ? 'עריכת שדה' : 'הוספת שדה חדש'}</h3>
                </div>

                <button
                  type="button"
                  className="field-modal-close"
                  onClick={closeModal}
                >
                  ✕
                </button>
              </div>

              <div className="field-modal-body">
                <label className="field">
                  <span>שם שדה</span>
                  <input
                    value={draft.field_label}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, field_label: e.target.value }))
                    }
                    placeholder="לדוגמה: עיר התקנה"
                  />
                </label>

                <label className="field">
                  <span>סוג שדה</span>
                  <SmartSelect
                    value={
                      TYPE_OPTIONS.find((option) => option.value === draft.field_type)?.label || ''
                    }
                    onChange={(selectedLabel) => {
                      const match = TYPE_OPTIONS.find((option) => option.label === selectedLabel);
                      setDraft((prev) => ({
                        ...prev,
                        field_type: match?.value || 'text',
                        options_text: match?.value === 'select' ? prev.options_text : ''
                      }));
                    }}
                    options={TYPE_OPTIONS.map((option) => option.label)}
                    placeholder="בחר סוג שדה"
                    searchPlaceholder="חפש סוג..."
                    emptyText="אין סוגים"
                  />
                </label>

                <label className="field">
                  <span>סדר</span>
                  <input
                    type="number"
                    value={draft.sort_order}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        sort_order: Number(e.target.value || 0)
                      }))
                    }
                  />
                </label>

                <label className="field">
                  <span>שדה חובה?</span>
                  <SmartSelect
                    value={draft.is_required ? 'כן' : 'לא'}
                    onChange={(selectedLabel) =>
                      setDraft((prev) => ({
                        ...prev,
                        is_required: selectedLabel === 'כן'
                      }))
                    }
                    options={['לא', 'כן']}
                    placeholder="בחר"
                    searchPlaceholder="חפש..."
                    emptyText="אין אפשרויות"
                  />
                </label>

                {draft.field_type === 'select' && (
                  <label className="field field-full">
                    <span>אפשרויות לרשימה</span>
                    <input
                      value={draft.options_text}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, options_text: e.target.value }))
                      }
                      placeholder="לדוגמה: קטן, בינוני, גדול"
                    />
                  </label>
                )}
              </div>

              {error && <div className="error-box">{error}</div>}

              <div className="field-modal-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={closeModal}
                  disabled={saving}
                >
                  ביטול
                </button>

                <button
                  type="button"
                  className="primary-btn"
                  onClick={saveModal}
                  disabled={saving}
                >
                  {saving
                    ? 'שומר...'
                    : editingField
                      ? 'שמור שינויים'
                      : 'הוסף שדה'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}