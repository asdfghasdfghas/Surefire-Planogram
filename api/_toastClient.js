// Shared Toast API helper for the serverless functions in this folder.
// Holds TOAST_CLIENT_SECRET server-side only — never send this file's
// contents or the token it fetches to the browser.

let cachedToken = null;
let cachedExpiryMs = 0;

function hostname() {
  return process.env.TOAST_API_HOSTNAME || 'ws-api.toasttab.com';
}

async function getToken() {
  const now = Date.now();
  if (cachedToken && now < cachedExpiryMs) return cachedToken;

  const res = await fetch(`https://${hostname()}/authentication/v1/authentication/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: process.env.TOAST_CLIENT_ID,
      clientSecret: process.env.TOAST_CLIENT_SECRET,
      userAccessType: 'TOAST_MACHINE_CLIENT',
    }),
  });
  if (!res.ok) {
    throw new Error(`Toast auth failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const accessToken = data.token && data.token.accessToken;
  const expiresIn = (data.token && data.token.expiresIn) || 3600;
  if (!accessToken) throw new Error('Toast auth response missing token.accessToken');

  cachedToken = accessToken;
  cachedExpiryMs = now + Math.max(60, expiresIn - 120) * 1000; // refresh 2min before real expiry
  return cachedToken;
}

async function toastFetch(path, opts = {}) {
  const token = await getToken();
  return fetch(`https://${hostname()}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
      Authorization: `Bearer ${token}`,
      'Toast-Restaurant-External-ID': process.env.TOAST_RESTAURANT_GUID,
    },
  });
}

// Simple shared-secret gate so these endpoints aren't freely callable by
// anyone who finds the URL — the write endpoint especially shouldn't be open.
function checkAppKey(req, res) {
  const expected = process.env.APP_SHARED_KEY;
  const got = req.headers['x-app-key'];
  if (!expected || got !== expected) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

module.exports = { getToken, toastFetch, checkAppKey };
