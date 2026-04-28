const rawBase = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const API_BASE = rawBase.replace(/\/$/, '');

function buildAuthHeaders() {
  const token = localStorage.getItem('token');
  if (!token) return {};
  return {
    Authorization: `Bearer ${token}`
  };
}

async function request(path, options = {}) {
  const mergedHeaders = {
    ...buildAuthHeaders(),
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: mergedHeaders
  });

  if (!response.ok) {
    let message = 'Request failed';
    try {
      const data = await response.json();
      message = data.error || message;
    } catch { }
    throw new Error(message);
  }

  if (response.status === 204) return null;

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.blob();
}

export const api = {
  login: async (payload) => {
    const result = await request('/api/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (result.token) {
      localStorage.setItem('token', result.token);
    }

    return result;
  },

  getUsers: () => request('/api/users'),
  createUser: (payload) =>
    request('/api/users', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateUserPassword: (id, password) =>
    request(`/api/users/${id}/password`, {
      method: 'PUT',
      body: JSON.stringify({ password })
    }),
  updateUserRole: (id, role) =>
    request(`/api/users/${id}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role })
    }),
  deleteUser: (id) =>
    request(`/api/users/${id}`, {
      method: 'DELETE'
    }),
  setupUser2FA: (id) =>
    request(`/api/users/${id}/setup-2fa`, {
      method: 'POST'
    }),
  enableUser2FA: (id, code) =>
    request(`/api/users/${id}/enable-2fa`, {
      method: 'POST',
      body: JSON.stringify({ code })
    }),
  disableUser2FA: (id) =>
    request(`/api/users/${id}/disable-2fa`, {
      method: 'POST'
    }),

  getProjects: () => request('/api/projects'),
  getProjectSummary: (projectId) => request(`/api/projects/${projectId}/summary`),
  createProject: (payload) =>
    request('/api/projects', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateProject: (id, payload) =>
    request(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  deleteProject: (id) =>
    request(`/api/projects/${id}`, {
      method: 'DELETE'
    }),

  getProjectFields: (projectId) => request(`/api/projects/${projectId}/fields`),
  createProjectField: (projectId, payload) =>
    request(`/api/projects/${projectId}/fields`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateProjectField: (projectId, fieldId, payload) =>
    request(`/api/projects/${projectId}/fields/${fieldId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  deleteProjectField: (projectId, fieldId) =>
    request(`/api/projects/${projectId}/fields/${fieldId}`, {
      method: 'DELETE'
    }),

  getCustomers: (search = '') =>
    request(`/api/customers?search=${encodeURIComponent(search)}`),
  createCustomer: (name) =>
    request('/api/customers', {
      method: 'POST',
      body: JSON.stringify({ name })
    }),
  updateCustomer: (id, name) =>
    request(`/api/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name })
    }),
  deleteCustomer: (id) =>
    request(`/api/customers/${id}`, {
      method: 'DELETE'
    }),

  getInstallers: (search = '') =>
    request(`/api/installers?search=${encodeURIComponent(search)}`),
  createInstaller: (name) =>
    request('/api/installers', {
      method: 'POST',
      body: JSON.stringify({ name })
    }),
  updateInstaller: (id, name) =>
    request(`/api/installers/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name })
    }),
  deleteInstaller: (id) =>
    request(`/api/installers/${id}`, {
      method: 'DELETE'
    }),

  getRows: ({ projectId, page, pageSize, search, status }) =>
    request(
      `/api/projects/${projectId}/rows?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(search || '')}&status=${encodeURIComponent(status || '')}`
    ),

  createRow: (projectId, payload) =>
    request(`/api/projects/${projectId}/rows`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  updateRow: (projectId, rowId, payload) =>
    request(`/api/projects/${projectId}/rows/${rowId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),

  deleteRow: (projectId, rowId) =>
    request(`/api/projects/${projectId}/rows/${rowId}`, {
      method: 'DELETE'
    }),

  previewImport: (projectId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return request(`/api/projects/${projectId}/import-preview`, {
      method: 'POST',
      body: formData
    });
  },

  importMappedRows: (projectId, payload) =>
    request(`/api/projects/${projectId}/import-mapped`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  exportRows: (projectId) =>
    request(`/api/projects/${projectId}/export`)
};