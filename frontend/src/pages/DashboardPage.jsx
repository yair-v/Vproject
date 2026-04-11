import AppBrand from '../components/AppBrand';

export default function DashboardPage({
    projects,
    loadingProjects,
    error,
    openProjectsPage,
    openProjectRows
}) {
    const totalProjects = projects.length;
    const totalRows = projects.reduce((sum, project) => sum + (project.rows_count || 0), 0);
    const activeProjects = projects.filter((project) => (project.rows_count || 0) > 0).length;

    const topProjects = [...projects]
        .sort((a, b) => (b.rows_count || 0) - (a.rows_count || 0))
        .slice(0, 5);

    const recentProjects = [...projects].slice(0, 6);

    return (
        <div className="app-shell app-shell-projects">
            <main className="main-panel single-panel">
                <AppBrand />

                <section className="toolbar card glass-card">
                    <div>
                        <div className="section-chip">Dashboard Pro</div>
                        <h2>לוח בקרה ראשי</h2>
                        <p>תצוגת על של כל המערכת, גישה מהירה לפרויקטים, סטטיסטיקות וכרטיסי שליטה.</p>
                    </div>

                    <div className="toolbar-actions">
                        <button type="button" className="primary-btn" onClick={openProjectsPage}>
                            מעבר לדף פרויקטים
                        </button>
                    </div>
                </section>

                <section className="stats-strip dashboard-stats-strip">
                    <div className="glass-card stat-box compact dashboard-stat-card">
                        <span>סה״כ פרויקטים</span>
                        <strong>{totalProjects}</strong>
                    </div>

                    <div className="glass-card stat-box compact dashboard-stat-card">
                        <span>סה״כ שורות במערכת</span>
                        <strong>{totalRows}</strong>
                    </div>

                    <div className="glass-card stat-box compact dashboard-stat-card">
                        <span>פרויקטים פעילים</span>
                        <strong>{activeProjects}</strong>
                    </div>
                </section>

                <section className="dashboard-layout">
                    <section className="card glass-card dashboard-main-card">
                        <div className="card-title-row">
                            <div>
                                <div className="section-chip">Quick Access</div>
                                <h3>פרויקטים אחרונים</h3>
                            </div>
                        </div>

                        {loadingProjects ? (
                            <div className="empty">טוען נתונים...</div>
                        ) : recentProjects.length ? (
                            <div className="dashboard-cards-grid">
                                {recentProjects.map((project) => (
                                    <button
                                        key={project.id}
                                        type="button"
                                        className="dashboard-project-card"
                                        onClick={() => openProjectRows(project.id)}
                                    >
                                        <div className="dashboard-project-top">
                                            <strong>{project.name}</strong>
                                            <span className="rows-badge">{project.rows_count || 0} שורות</span>
                                        </div>

                                        <p>{project.description || 'ללא תיאור'}</p>

                                        <div className="dashboard-project-footer">
                                            <span>פתח ניהול</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="empty">עדיין אין פרויקטים במערכת</div>
                        )}

                        {error && <div className="error-box">{error}</div>}
                    </section>

                    <aside className="dashboard-side-column">
                        <section className="card glass-card dashboard-side-card">
                            <div className="card-title-row">
                                <div>
                                    <div className="section-chip">Top 5</div>
                                    <h3>פרויקטים עם הכי הרבה שורות</h3>
                                </div>
                            </div>

                            {loadingProjects ? (
                                <div className="empty">טוען...</div>
                            ) : topProjects.length ? (
                                <div className="dashboard-ranking-list">
                                    {topProjects.map((project, index) => (
                                        <button
                                            key={project.id}
                                            type="button"
                                            className="dashboard-ranking-item"
                                            onClick={() => openProjectRows(project.id)}
                                        >
                                            <div className="dashboard-ranking-index">{index + 1}</div>
                                            <div className="dashboard-ranking-content">
                                                <strong>{project.name}</strong>
                                                <span>{project.rows_count || 0} שורות</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="empty">אין נתונים להצגה</div>
                            )}
                        </section>

                        <section className="card glass-card dashboard-side-card dashboard-actions-card">
                            <div className="card-title-row">
                                <div>
                                    <div className="section-chip">Actions</div>
                                    <h3>פעולות מהירות</h3>
                                </div>
                            </div>

                            <div className="dashboard-action-buttons">
                                <button type="button" className="primary-btn" onClick={openProjectsPage}>
                                    יצירת פרויקט / ניהול פרויקטים
                                </button>
                                <button
                                    type="button"
                                    className="secondary-btn"
                                    onClick={() => {
                                        if (recentProjects[0]) {
                                            openProjectRows(recentProjects[0].id);
                                        }
                                    }}
                                >
                                    פתח פרויקט אחרון
                                </button>
                            </div>
                        </section>
                    </aside>
                </section>
            </main>
        </div>
    );
}