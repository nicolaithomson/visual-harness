#!/usr/bin/env node
// visual-login — mints an authenticated Playwright storage state by calling a
// dev-only E2E login seam, then persists it — but ONLY after confirming a
// session cookie is actually present, so it never saves an unauthenticated
// state. Framework-agnostic: the app owns the seam; this just drives it.
//
// Run with the app's local env loaded, e.g. via Node's --env-file:
//   node --env-file=.env.local node_modules/.bin/visual-login
// or a package.json script that does the same.
//
// Env:
//   BASE_URL          default http://localhost:3000
//   E2E_LOGIN_SECRET  required — sent as x-e2e-secret to the seam
//   E2E_LOGIN_PATH    default /api/dev/e2e-login
//   VISUAL_STATE      default visual/.auth/session.json
//   AUTH_COOKIE_RE    default ^sb-.*-auth-token   (regex a saved cookie must match)
import { chromium } from "@playwright/test";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.E2E_LOGIN_SECRET;
const SEAM_PATH = process.env.E2E_LOGIN_PATH ?? "/api/dev/e2e-login";
const STATE = process.env.VISUAL_STATE ?? "visual/.auth/session.json";
const COOKIE_RE = new RegExp(process.env.AUTH_COOKIE_RE ?? "^sb-.*-auth-token");

if (!SECRET) {
  console.error("✗ E2E_LOGIN_SECRET not set. Load your local env (e.g. node --env-file=.env.local …).");
  process.exit(1);
}

const browser = await chromium.launch();
const ctx = await browser.newContext();

// maxRedirects:0 — the seam returns a JSON 200 with Set-Cookie when active. If
// it is inactive (gated/404 → a redirect to an app shell or login), Playwright
// throws on the disallowed redirect; either way we must NOT persist a state.
let status;
let body = "";
try {
  const resp = await ctx.request.get(`${BASE}${SEAM_PATH}`, {
    headers: { "x-e2e-secret": SECRET },
    maxRedirects: 0,
  });
  status = resp.status();
  body = await resp.text().catch(() => "");
} catch (err) {
  console.error(`✗ seam request failed / redirected (seam inactive): ${err.message}`);
  await browser.close();
  process.exit(1);
}

if (status !== 200) {
  console.error(`✗ seam returned ${status} (expected 200) — seam inactive or credentials wrong.`);
  if (body) console.error(`  ${body.slice(0, 300)}`);
  await browser.close();
  process.exit(1);
}

// Confirm an auth cookie is present before saving. Supabase chunks it as
// sb-<ref>-auth-token(.0/.1) — match by pattern (AUTH_COOKIE_RE), never a single
// hard-coded name. Override AUTH_COOKIE_RE for other auth stacks.
const state = await ctx.storageState();
const authCookies = state.cookies.filter((c) => COOKIE_RE.test(c.name));
if (authCookies.length === 0) {
  console.error(`✗ seam returned 200 but no cookie matched ${COOKIE_RE} — refusing to save an unauthenticated session.`);
  await browser.close();
  process.exit(1);
}

mkdirSync(dirname(STATE), { recursive: true });
await ctx.storageState({ path: STATE });
console.log(`✓ minted session + wrote ${STATE}`);
console.log(`  auth cookies: ${authCookies.map((c) => c.name).join(", ")}`);
await browser.close();
