export interface E2eLoginEnv {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  E2E_LOGIN_ENABLED?: string;
  E2E_LOGIN_SECRET?: string;
  [key: string]: string | undefined;
}

/** Env-only surface gate (Edge-safe; no secret comparison). */
export function e2eDevSurfaceEnabled(env: E2eLoginEnv): boolean;

/** Constant-time (SHA-256 + timingSafeEqual) string comparison. */
export function constantTimeEqual(a: string, b: string): boolean;

/** Fail-closed gate for the dev-only E2E login seam. */
export function e2eLoginAllowed(
  env: E2eLoginEnv,
  providedSecret: string | null | undefined,
): boolean;
