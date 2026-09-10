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

/** Upload a score's PDF with progress (XHR: fetch has no upload progress). Resolves to the server's JSON. */
function uploadFile(id, blob, sha256, { onProgress = null, signal = null } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/scores/${encodeURIComponent(id)}/file`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-Chopinly", "1");
    xhr.setRequestHeader("x-chopinly-sha256", sha256);
    xhr.setRequestHeader("content-type", "application/pdf");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded, e.total); };
    const fail = (status, message, extra = {}) => { const err = Object.assign(new Error(message), { status, ...extra }); reject(err); };
    xhr.onerror = () => fail(0, "you're offline", { offline: true });
    xhr.onabort = () => fail(0, "upload cancelled", { aborted: true });
    xhr.onload = () => {
      const data = xhr.response ?? {};
      if (xhr.status >= 200 && xhr.status < 300) resolve(data); else fail(xhr.status, data.error ?? `something went wrong (${xhr.status})`);
    };
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(blob);
  });
}

/** Download a score's PDF with progress. Resolves to a Blob; errors carry `status` and a sentence. */
async function downloadFile(id, { onProgress = null, signal = null } = {}) {
  let res;
  try { res = await fetch(`/api/scores/${encodeURIComponent(id)}/file`, { credentials: "same-origin", cache: "no-store", headers: APP, signal }); }
  catch (e) { if (e.name === "AbortError") throw Object.assign(new Error("download cancelled"), { status: 0, aborted: true }); throw Object.assign(new Error("you're offline"), { status: 0, offline: true }); }
  if (!res.ok) { const data = await res.json().catch(() => ({})); throw Object.assign(new Error(data.error ?? `something went wrong (${res.status})`), { status: res.status }); }
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body || !onProgress) return new Blob([await res.arrayBuffer()], { type: "application/pdf" });
  const reader = res.body.getReader(), chunks = [];
  let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.byteLength; onProgress(got, total); }
  return new Blob(chunks, { type: "application/pdf" });
}

export const account = {
  me: () => api("GET", "/api/me"),
  requestCode: (email) => api("POST", "/api/auth/code", { email }),
  verify: (email, code) => api("POST", "/api/auth/verify", { email, code }),
  signOut: () => api("POST", "/api/auth/signout"),
  deleteAccount: () => api("DELETE", "/api/me"),
  sync: (cursor, changes) => api("POST", "/api/sync", { cursor, changes }),
  exportUrl: "/api/me/export",
  // cloud score files (WSHED-102)
  files: () => api("GET", "/api/scores/files"),
  uploadFile, downloadFile,
  deleteFile: (id) => api("DELETE", `/api/scores/${encodeURIComponent(id)}/file`),
};
