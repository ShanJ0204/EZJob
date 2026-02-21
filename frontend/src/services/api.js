const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const headers = () => ({ 'Content-Type': 'application/json' });

const handleResponse = async (res) => {
  if (res.status === 401) {
    window.location.href = '/';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
};

export const api = {
  exchangeSession: (sessionId) =>
    fetch(`${API_URL}/api/auth/session?session_id=${sessionId}`, {
      credentials: 'include',
    }).then(handleResponse),

  getMe: () =>
    fetch(`${API_URL}/api/auth/me`, { credentials: 'include' }).then(handleResponse),

  logout: () =>
    fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' }).then(handleResponse),

  getDashboard: () =>
    fetch(`${API_URL}/api/dashboard`, { credentials: 'include' }).then(handleResponse),

  getMatches: (status) => {
    const url = status ? `${API_URL}/api/matches?status=${status}` : `${API_URL}/api/matches`;
    return fetch(url, { credentials: 'include' }).then(handleResponse);
  },

  getMatch: (matchId) =>
    fetch(`${API_URL}/api/matches/${matchId}`, { credentials: 'include' }).then(handleResponse),

  matchAction: (matchId, action) =>
    fetch(`${API_URL}/api/matches/${matchId}/action`, {
      method: 'POST', headers: headers(), credentials: 'include',
      body: JSON.stringify({ action }),
    }).then(handleResponse),

  getPreferences: () =>
    fetch(`${API_URL}/api/preferences`, { credentials: 'include' }).then(handleResponse),

  updatePreferences: (data) =>
    fetch(`${API_URL}/api/preferences`, {
      method: 'PUT', headers: headers(), credentials: 'include',
      body: JSON.stringify(data),
    }).then(handleResponse),

  getProfile: () =>
    fetch(`${API_URL}/api/profile`, { credentials: 'include' }).then(handleResponse),

  updateProfile: (data) =>
    fetch(`${API_URL}/api/profile`, {
      method: 'PUT', headers: headers(), credentials: 'include',
      body: JSON.stringify(data),
    }).then(handleResponse),

  getApplications: () =>
    fetch(`${API_URL}/api/applications`, { credentials: 'include' }).then(handleResponse),

  markApplied: (attemptId) =>
    fetch(`${API_URL}/api/applications/${attemptId}/mark-applied`, {
      method: 'POST', credentials: 'include',
    }).then(handleResponse),

  runMatching: () =>
    fetch(`${API_URL}/api/matching/run`, {
      method: 'POST', credentials: 'include',
    }).then(handleResponse),

  triggerIngestion: () =>
    fetch(`${API_URL}/api/ingestion/run`, {
      method: 'POST', credentials: 'include',
    }).then(handleResponse),

  getJobs: (limit = 50, skip = 0) =>
    fetch(`${API_URL}/api/jobs?limit=${limit}&skip=${skip}`, { credentials: 'include' }).then(handleResponse),
};
