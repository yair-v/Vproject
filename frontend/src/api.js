const rawBase = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const API_BASE = rawBase.replace(/\/$/, '');

function getAuthHeaders() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!user) return {};
    return {
      'x-user-id': String(user.id),
      'x-user-role': String(user.role || '')
    };
  } catch {
    return {};
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...getAuthHeaders(),
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
  login: (payload) => request('/api/login', { method: 'POST', body: JSON.stringify(payload) }),
  getUsers: () => request('/api/users'),
  createUser: (payload) => request('/api/users', { method: 'POST', body: JSON.stringify(payload) }),
updateUserRole: (id, role) => request(`/api/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
updateUserPassword: (id, password) => request(`/api/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) }),
deleteUser: (id) => request(`/api/users/${id}`, { method: 'DELETE' }),


  getProjects: () => request('/api/projects'),
  getProjectSummary: (projectId) => request(`/api/projects/${projectId}/summary`),
  createProject: (payload) => request('/api/projects', { method: 'POST', body: JSON.stringify(payload) }),
  updateProject: (id, payload) => request(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteProject: (id) => request(`/api/projects/${id}`, { method: 'DELETE' }),

  getCustomers: (search = '') => request(`/api/customers?search=${encodeURIComponent(search)}`),
  createCustomer: (name) => request('/api/customers', { method: 'POST', body: JSON.stringify({ name }) }),
  updateCustomer: (id, name) => request(`/api/customers/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  deleteCustomer: (id) => request(`/api/customers/${id}`, { method: 'DELETE' }),

  getInstallers: (search = '') => request(`/api/installers?search=${encodeURIComponent(search)}`),
  createInstaller: (name) => request('/api/installers', { method: 'POST', body: JSON.stringify({ name }) }),
  updateInstaller: (id, name) => request(`/api/installers/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  deleteInstaller: (id) => request(`/api/installers/${id}`, { method: 'DELETE' }),

  getRows: ({ projectId, page, pageSize, search, status }) =>
    request(`/api/projects/${projectId}/rows?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(search || '')}&status=${encodeURIComponent(status || '')}`),
  createRow: (projectId, payload) => request(`/api/projects/${projectId}/rows`, { method: 'POST', body: JSON.stringify(payload) }),
  updateRow: (projectId, rowId, payload) => request(`/api/projects/${projectId}/rows/${rowId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteRow: (projectId, rowId) => request(`/api/projects/${projectId}/rows/${rowId}`, { method: 'DELETE' }),

  previewImport: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return request('/api/import/preview', { method: 'POST', body: formData });
  },
  importMappedRows: (projectId, payload) => request(`/api/projects/${projectId}/import-mapped`, { method: 'POST', body: JSON.stringify(payload) }),
  exportRows: (projectId) => request(`/api/projects/${projectId}/export`)
};
