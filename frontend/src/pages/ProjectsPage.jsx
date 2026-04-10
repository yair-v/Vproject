export default function ProjectsPage({
    projects,
    loadingProjects,
    error,
    projectName,
    setProjectName,
    projectDescription,
    setProjectDescription,
    createProject,
    openProject
}) {
    return (
        <div className="app-shell app-shell-projects">
            <main className="main-panel single-panel">
                <section className="toolbar card glass-card">
                    <div>
                        <div className="section-chip">Projects</div>
                        <h2>ניהול פרויקטים</h2>
                        <p>יצירה, בחירה וכניסה לניהול מפורט של כל פרויקט במסך נפרד.</p>
                    </div>
                </section>

                <section className="projects-layout">
                    <section className="card glass-card projects-create-card">
                        <div className="card-title-row">
                            <div>
                                <div className="section-chip">New Project</div>
                                <h3>יצירת פרויקט חדש</h3>
                            </div>
                        </div>

                        <form className="project-form" onSubmit={createProject}>
                            <label className="field">
                                <span>שם פרויקט</span>
                                <input
                                    value={projectName}
                                    onChange={(e) => setProjectName(e.target.value)}
                                    placeholder="לדוגמה: פרויקט סניפי לאומי"
                                />
                            </label>

                            <label className="field">
                                <span>תיאור</span>
                                <input
                                    value={projectDescription}
                                    onChange={(e) => setProjectDescription(e.target.value)}
                                    placeholder="תיאור קצר"
                                />
                            </label>

                            <div className="form-actions">
                                <button type="submit" className="primary-btn">צור פרויקט</button>
                            </div>
                        </form>

                        {error && <div className="error-box">{error}</div>}
                    </section>

                    <section className="card glass-card projects-list-card">
                        <div className="card-title-row">
                            <div>
                                <div className="section-chip">All Projects</div>
                                <h3>רשימת פרויקטים</h3>
                            </div>
                        </div>

                        {loadingProjects ? (
                            <div className="empty">טוען פרויקטים...</div>
                        ) : projects.length ? (
                            <div className="projects-pro-grid">
                                {projects.map((project) => (
                                    <button
                                        key={project.id}
                                        type="button"
                                        className="project-pro-card"
                                        onClick={() => openProject(project.id)}
                                    >
                                        <div className="project-pro-top">
                                            <strong>{project.name}</strong>
                                            <span className="rows-badge">{project.rows_count || 0} שורות</span>
                                        </div>

                                        <p>{project.description || 'ללא תיאור'}</p>

                                        <div className="project-pro-bottom">
                                            <span>פתח ניהול</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="empty">עדיין אין פרויקטים</div>
                        )}
                    </section>
                </section>
            </main>
        </div>
    );
}