const rawBase = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const API_BASE = rawBase.replace(/\/$/, '');

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers
    },
    ...options
  });

  if (!response.ok) {
    let message = 'Request failed';
    try {
      const data = await response.json();
      message = data.error || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  return response.blob();
}

export const api = {
  getProjects: () => request('/api/projects'),
  createProject: (payload) => request('/api/projects', { method: 'POST', body: JSON.stringify(payload) }),
  updateProject: (id, payload) => request(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteProject: (id) => request(`/api/projects/${id}`, { method: 'DELETE' }),
  getCustomers: (search = '') => request(`/api/customers?search=${encodeURIComponent(search)}`),
  createCustomer: (name) => request('/api/customers', { method: 'POST', body: JSON.stringify({ name }) }),
  getInstallers: (search = '') => request(`/api/installers?search=${encodeURIComponent(search)}`),
  createInstaller: (name) => request('/api/installers', { method: 'POST', body: JSON.stringify({ name }) }),
  getRows: ({ projectId, page, pageSize, search, status }) =>
    request(`/api/projects/${projectId}/rows?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(search || '')}&status=${encodeURIComponent(status || '')}`),
  createRow: (projectId, payload) => request(`/api/projects/${projectId}/rows`, { method: 'POST', body: JSON.stringify(payload) }),
  updateRow: (projectId, rowId, payload) => request(`/api/projects/${projectId}/rows/${rowId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteRow: (projectId, rowId) => request(`/api/projects/${projectId}/rows/${rowId}`, { method: 'DELETE' }),
  importRows: (projectId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return request(`/api/projects/${projectId}/import`, { method: 'POST', body: formData });
  },
  exportRows: (projectId) => request(`/api/projects/${projectId}/export`)
};
