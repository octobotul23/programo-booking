export const SIGNED_OUT = 'programo:signed-out';

/** Thin fetch wrapper: JSON in/out, throws { code, status, data } on errors. */
export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw Object.assign(new Error('network'), { code: 'network' });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const { error, ...rest } = data;
    // the session ended elsewhere (logged out, password reset, removed from the team): let the app know
    if (res.status === 401 && error === 'not_logged_in') window.dispatchEvent(new Event(SIGNED_OUT));
    throw Object.assign(new Error(error || 'error'), { code: error || 'generic', status: res.status, data: rest });
  }
  return data;
}

export const qs = (params) =>
  '?' +
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
