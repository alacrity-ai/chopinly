// Thin fetch wrappers over /api (docs/ACCOUNTS_DESIGN.md §5). Same origin,
// cookie session, app header for CSRF. Errors carry `status` and a sentence.
const APP = { "X-Chopinly": "1" };

async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method, credentials: "same-origin", cache: "no-store",
      headers: body === undefined ? APP : { ...APP, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    const err = new Error("you're offline"); err.status = 0; err.offline = true; throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.error ?? `something went wrong (${res.status})`); err.status = res.status; throw err; }
  return data;
}

export const account = {
  me: () => api("GET", "/api/me"),
  requestCode: (email) => api("POST", "/api/auth/code", { email }),
  verify: (email, code) => api("POST", "/api/auth/verify", { email, code }),
  signOut: () => api("POST", "/api/auth/signout"),
  deleteAccount: () => api("DELETE", "/api/me"),
  sync: (cursor, changes) => api("POST", "/api/sync", { cursor, changes }),
  exportUrl: "/api/me/export",
};
