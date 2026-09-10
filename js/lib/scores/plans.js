// Plans and quotas (docs/SCORES_DESIGN.md §10, §11.5). Shared by the browser
// and the Pages Functions so both name the same numbers — like merge.js.
//
// Cloud score files are the first thing a user can do that costs money, so
// the quota is data on the account (`users.plan`), not a constant in the API.
// "premium" is a flag an operator sets today (no sign-up, no billing yet);
// it exists so a real premium can land later without a migration.
export const MB = 1024 * 1024;
export const PLANS = {
  free: { quotaBytes: 100 * MB, label: "promotional" },   // Leif, 2026-09-09: promotional until premium is a feature
  premium: { quotaBytes: 5 * 1024 * MB, label: "premium" },
};
/** Per-file cap on import and upload (design §12); under Cloudflare's 100 MB request body limit. */
export const MAX_FILE_BYTES = 60 * MB;

export const normPlan = (p) => (typeof p === "string" && p in PLANS ? p : "free");
export const quotaBytes = (plan) => PLANS[normPlan(plan)].quotaBytes;
export const planLabel = (plan) => PLANS[normPlan(plan)].label;
/** "84 MB", "1.2 GB" — the same voice everywhere the quota is spoken of. */
export const fmtQuota = (b) => (b >= 1024 * MB ? `${(b / (1024 * MB)).toFixed(b % (1024 * MB) ? 1 : 0)} GB` : b >= MB ? `${Math.round(b / MB)} MB` : `${Math.round(b / 1024)} KB`);
/** Whether `add` more bytes fit: { ok, used, quota, over } — `over` is the shortfall. */
export function fits(plan, used, add) {
  const quota = quotaBytes(plan);
  const next = Math.max(0, used) + Math.max(0, add);
  return { ok: next <= quota, used, quota, over: Math.max(0, next - quota) };
}
