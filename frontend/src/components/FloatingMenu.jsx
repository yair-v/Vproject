import { useState } from 'react';

export default function FloatingMenu({ onHome, onProjects, onSettings, onBack, onLogout, user }) {
  const [open, setOpen] = useState(false);

  function run(action) {
    setOpen(false);
    action?.();
  }

  return (
    <div className={`floating-menu ${open ? 'open' : ''}`}>
      <div className="floating-menu-actions">
        <button type="button" className="floating-menu-item" onClick={() => run(onLogout)}>
          <span>🚪</span>
          <span>התנתקות</span>
        </button>
        <button type="button" className="floating-menu-item" onClick={() => run(onBack)}>
          <span>↩</span>
          <span>חזרה</span>
        </button>
        <button type="button" className="floating-menu-item" onClick={() => run(onSettings)}>
          <span>⚙</span>
          <span>הגדרות</span>
        </button>
        <button type="button" className="floating-menu-item" onClick={() => run(onProjects)}>
          <span>📁</span>
          <span>פרויקטים</span>
        </button>
        <button type="button" className="floating-menu-item" onClick={() => run(onHome)}>
          <span>🏠</span>
          <span>דשבורד</span>
        </button>
      </div>

      <button
        type="button"
        className="floating-menu-toggle"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="פתח תפריט"
      >
        <span className="floating-menu-toggle-icon">{open ? '×' : '☰'}</span>
      </button>

      <div className="floating-menu-user">{user?.username || ''} / {user?.role || ''}</div>
    </div>
  );
}
