import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import AppBrand from '../components/AppBrand';
import SmartSelect from '../components/SmartSelect';

function DisplaySettingsTab({ displaySettings, setDisplaySettings }) {
  return (
    <section className="card glass-card settings-panel">
      <div className="card-title-row">
        <div>
          <div className="section-chip">Display</div>
          <h3>תצוגה</h3>
        </div>
      </div>

      <div className="settings-grid">
        <label className="field">
          <span>ערכת נושא</span>
          <div className="segmented-status">
            <button
              type="button"
              className={displaySettings.theme === 'dark' ? 'active' : ''}
              onClick={() =>
                setDisplaySettings((prev) => ({ ...prev, theme: 'dark' }))
              }
            >
              כהה
            </button>

            <button
              type="button"
              className={displaySettings.theme === 'light' ? 'active' : ''}
              onClick={() =>
                setDisplaySettings((prev) => ({ ...prev, theme: 'light' }))
              }
            >
              בהיר
            </button>
          </div>
        </label>

        <label className="field">
          <span>זום: {displaySettings.zoom}%</span>
          <input
            type="range"
            min="75"
            max="125"
            step="5"
            value={displaySettings.zoom}
            onChange={(e) =>
              setDisplaySettings((prev) => ({
                ...prev,
                zoom: Number(e.target.value)
              }))
            }
          />
        </label>
      </div>
    </section>
  );
}

function UsersTab({ user }) {
  const [users, setUsers] = useState([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('manager');
  const [error, setError] = useState('');

  async function loadUsers() {
    try {
      setUsers(await api.getUsers());
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (user.role === 'admin') loadUsers();
  }, [user.role]);

  async function createUser() {
    try {
      await api.createUser({ username, password, role });
      setUsername('');
      setPassword('');
      setRole('manager');
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function changeRole(item, newRole) {
    try {
      await api.updateUserRole(item.id, newRole);
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function changePassword(item) {
    const newPassword = window.prompt(`סיסמה חדשה עבור ${item.username}`);
    if (!newPassword?.trim()) return;

    try {
      await api.updateUserPassword(item.id, newPassword.trim());
      setError('');
      window.alert('הסיסמה עודכנה');
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeUser(item) {
    if (!window.confirm(`למחוק את המשתמש ${item.username}?`)) return;

    try {
      await api.deleteUser(item.id);
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  if (user.role !== 'admin') {
    return (
      <section className="card glass-card settings-panel">
        <div className="empty">אין הרשאה לניהול משתמשים</div>
      </section>
    );
  }

  return (
    <section className="card glass-card settings-panel">
      <div className="card-title-row">
        <div>
          <div className="section-chip">Users</div>
          <h3>ניהול משתמשים</h3>
        </div>
      </div>

      <div className="settings-grid">
        <label className="field">
          <span>שם משתמש</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>

        <label className="field">
          <span>סיסמה</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <label className="field">
          <span>רמה</span>
          <SmartSelect
            value={role === 'admin' ? 'מנהל' : 'אחראי'}
            onChange={(selected) =>
              setRole(selected === 'מנהל' ? 'admin' : 'manager')
            }
            options={['אחראי', 'מנהל']}
            placeholder="בחר רמה"
            searchPlaceholder="חפש רמה..."
            emptyText="אין רמות"
          />
        </label>
      </div>

      <div className="form-actions">
        <button type="button" className="primary-btn" onClick={createUser}>
          צור משתמש
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>שם משתמש</th>
              <th>רמה</th>
              <th>נוצר</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {users.map((item) => (
              <tr key={item.id}>
                <td>{item.username}</td>
                <td>
                  <SmartSelect
                    value={item.role === 'admin' ? 'מנהל' : 'אחראי'}
                    onChange={(selected) =>
                      changeRole(item, selected === 'מנהל' ? 'admin' : 'manager')
                    }
                    options={['אחראי', 'מנהל']}
                    placeholder="בחר רמה"
                    searchPlaceholder="חפש רמה..."
                    emptyText="אין רמות"
                  />
                </td>
                <td>
                  {item.created_at
                    ? new Date(item.created_at).toLocaleDateString('he-IL', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    })
                    : ''}
                </td>
                <td></td>
                <td>
                  <div className="row-actions">
                    <button type="button" onClick={() => changePassword(item)}>
                      שנה סיסמה
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => removeUser(item)}
                    >
                      מחק
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TablesTab({ user }) {
  const [customers, setCustomers] = useState([]);
  const [installers, setInstallers] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [installerName, setInstallerName] = useState('');
  const [error, setError] = useState('');

  async function loadData() {
    try {
      setCustomers(await api.getCustomers(''));
      setInstallers(await api.getInstallers(''));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function addCustomer() {
    try {
      await api.createCustomer(customerName);
      setCustomerName('');
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addInstaller() {
    try {
      await api.createInstaller(installerName);
      setInstallerName('');
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function renameCustomer(item) {
    const name = window.prompt('שם חדש ללקוח', item.name);
    if (name?.trim()) {
      try {
        await api.updateCustomer(item.id, name.trim());
        loadData();
      } catch (err) {
        setError(err.message);
      }
    }
  }

  async function removeCustomer(item) {
    if (window.confirm(`למחוק את ${item.name}?`)) {
      try {
        await api.deleteCustomer(item.id);
        loadData();
      } catch (err) {
        setError(err.message);
      }
    }
  }

  async function renameInstaller(item) {
    const name = window.prompt('שם חדש למתקין', item.name);
    if (name?.trim()) {
      try {
        await api.updateInstaller(item.id, name.trim());
        loadData();
      } catch (err) {
        setError(err.message);
      }
    }
  }

  async function removeInstaller(item) {
    if (window.confirm(`למחוק את ${item.name}?`)) {
      try {
        await api.deleteInstaller(item.id);
        loadData();
      } catch (err) {
        setError(err.message);
      }
    }
  }

  return (
    <section className="settings-tables-grid">
      <section className="card glass-card settings-panel">
        <div className="card-title-row">
          <div>
            <div className="section-chip">Tables</div>
            <h3>טבלת לקוחות</h3>
          </div>
        </div>

        <div className="form-actions">
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="לקוח חדש"
          />
          <button type="button" className="primary-btn" onClick={addCustomer}>
            הוסף
          </button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>שם</th>
                <th>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>
                    <div className="row-actions">
                      <button type="button" onClick={() => renameCustomer(item)}>
                        ערוך
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => removeCustomer(item)}
                      >
                        מחק
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card glass-card settings-panel">
        <div className="card-title-row">
          <div>
            <div className="section-chip">Tables</div>
            <h3>טבלת מתקינים</h3>
          </div>
        </div>

        {user.role === 'admin' ? (
          <>
            <div className="form-actions">
              <input
                value={installerName}
                onChange={(e) => setInstallerName(e.target.value)}
                placeholder="מתקין חדש"
              />
              <button type="button" className="primary-btn" onClick={addInstaller}>
                הוסף
              </button>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>שם</th>
                    <th>פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {installers.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>
                        <div className="row-actions">
                          <button type="button" onClick={() => renameInstaller(item)}>
                            ערוך
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => removeInstaller(item)}
                          >
                            מחק
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="empty">לניהול מתקינים נדרשת הרשאת מנהל</div>
        )}
      </section>

      {error && <div className="error-box">{error}</div>}
    </section>
  );
}

export default function SettingsPage({
  user,
  onBack,
  onLogout,
  displaySettings,
  setDisplaySettings
}) {
  const tabs = useMemo(() => {
    return [
      { key: 'display', label: 'תצוגה' },
      { key: 'tables', label: 'טבלאות' },
      ...(user.role === 'admin' ? [{ key: 'users', label: 'משתמשים' }] : [])
    ];
  }, [user.role]);

  const [activeTab, setActiveTab] = useState(tabs[0].key);

  useEffect(() => {
    if (!tabs.some((tab) => tab.key === activeTab)) {
      setActiveTab(tabs[0].key);
    }
  }, [tabs, activeTab]);

  return (
    <div className="app-shell app-shell-projects">
      <main className="main-panel single-panel">
        <section className="hero-with-brand">
          <section className="toolbar card glass-card hero-toolbar">
            <div>
              <div className="section-chip">Settings</div>
              <h2>הגדרות מערכת</h2>
              <p>ניהול משתמשים, תצוגה, וזום, יחד עם ניהול טבלאות בסיס.</p>
            </div>

            <div className="toolbar-actions">
              <button type="button" className="secondary-btn" onClick={onBack}>
                חזרה
              </button>
              <button type="button" className="secondary-btn" onClick={onLogout}>
                התנתק
              </button>
              <span className="rows-badge">
                {user.username} / {user.role}
              </span>
            </div>
          </section>

          <AppBrand />
        </section>

        <section className="settings-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`settings-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </section>

        {activeTab === 'display' && (
          <DisplaySettingsTab
            displaySettings={displaySettings}
            setDisplaySettings={setDisplaySettings}
          />
        )}

        {activeTab === 'tables' && <TablesTab user={user} />}
        {activeTab === 'users' && <UsersTab user={user} />}
      </main>
    </div>
  );
}