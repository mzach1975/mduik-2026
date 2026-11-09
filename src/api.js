const BASE = '/api';

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request(path, options = {}) {
  const { method = 'GET', body, headers = {}, raw = false } = options;
  const init = { method, credentials: 'include', headers: { ...headers } };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new ApiError('Tidak dapat menghubungi pelayan. / Cannot reach the server.', 0);
  }
  if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/public')) {
    window.dispatchEvent(new CustomEvent('mduik:unauthorized'));
  }
  if (res.status === 403 && res.headers.get('content-type')?.includes('application/json')) {
    const peek = await res.clone().json().catch(() => null);
    if (peek?.code === 'password_change_required') window.dispatchEvent(new CustomEvent('mduik:password-change'));
  }
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json().catch(() => null) : await res.text();
  if (!res.ok) {
    const message = (data && data.error) || res.statusText || 'Request failed';
    throw new ApiError(message, res.status, data);
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  del: (path, body) => request(path, { method: 'DELETE', body }),
  upload: (path, formData) => request(path, { method: 'POST', body: formData }),
  url: (path) => `${BASE}${path}`,
};

export function openFile(path) {
  window.open(`${BASE}${path}`, '_blank', 'noopener');
}

export function downloadFile(path) {
  const a = document.createElement('a');
  a.href = `${BASE}${path}`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
