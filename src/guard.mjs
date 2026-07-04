import { createHash, timingSafeEqual } from "node:crypto";

/**
 * @typedef {Object} E2eLoginEnv
 * @property {string} [NODE_ENV]
 * @property {string} [VERCEL_ENV]
 * @property {string} [E2E_LOGIN_ENABLED]
 * @property {string} [E2E_LOGIN_SECRET]
 */

/**
 * Env-only gate for the dev-only E2E login *surface* (e.g. `/api/dev/*`).
 * Imports nothing from `node:crypto` transitively beyond this module, and does
 * no secret comparison — safe to call from Edge middleware. Answers only the
 * coarse "should this surface exist in this environment?" question.
 *
 * Fail-closed: production is inert regardless of any flag.
 * @param {E2eLoginEnv} env
 * @returns {boolean}
 */
export function e2eDevSurfaceEnabled(env) {
  if (env.NODE_ENV === "production") return false;
  if (env.VERCEL_ENV === "production") return false;
  return env.E2E_LOGIN_ENABLED === "true";
}

/**
 * Constant-time secret comparison. Both inputs are hashed to a fixed 32-byte
 * SHA-256 digest first, so `timingSafeEqual` always sees equal-length buffers
 * (unequal lengths make it throw, leaking the expected length via the exception
 * path). Comparing digests is timing-safe and length-independent.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function constantTimeEqual(a, b) {
  const digestA = createHash("sha256").update(String(a), "utf8").digest();
  const digestB = createHash("sha256").update(String(b), "utf8").digest();
  return timingSafeEqual(digestA, digestB);
}

/**
 * Fail-closed gate for the dev-only E2E login seam. Returns `true` ONLY when
 * every condition holds; any doubt returns `false` so the caller can respond
 * 404 (never 403 — the surface must be indistinguishable from "does not exist"
 * in production). Framework-agnostic; the caller supplies `env` (usually
 * `process.env`) and the request-provided secret.
 *
 * @param {E2eLoginEnv} env
 * @param {string|null|undefined} providedSecret
 * @returns {boolean}
 */
export function e2eLoginAllowed(env, providedSecret) {
  if (!e2eDevSurfaceEnabled(env)) return false;
  const secret = env.E2E_LOGIN_SECRET;
  if (!secret || secret.length < 16) return false;
  if (!providedSecret) return false;
  return constantTimeEqual(providedSecret, secret);
}
