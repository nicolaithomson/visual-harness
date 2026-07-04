#!/usr/bin/env node
// visual-shoot — headless screenshot harness (framework-agnostic).
// Navigates each route arg and writes a full-page PNG at desktop (1440×900) and
// mobile (390×844), deviceScaleFactor 2. Captures console + page errors, prints
// per-route HTTP status + error count, and FAILS (exit 1) on 4xx/5xx or an
// unexpected redirect (e.g. expired session → /login) so it never passes a
// login-page screenshot as authenticated. Reuses a saved auth state if present.
//
//   visual-shoot /                         # public
//   visual-shoot /dashboard /profile       # authenticated (needs a saved session)
//   BASE_URL=http://localhost:3001 VIEWPORTS=desktop visual-shoot /
//
// Env: BASE_URL (default http://localhost:3000), VIEWPORTS (default
// "desktop,mobile"), VISUAL_STATE (default visual/.auth/session.json),
// VISUAL_OUT (default visual/shots).
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const STATE = process.env.VISUAL_STATE ?? "visual/.auth/session.json";
const OUT = process.env.VISUAL_OUT ?? "visual/shots";
const routes = process.argv.slice(2);
const VP = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

if (routes.length === 0) {
  console.error("usage: visual-shoot <route> [route...]   e.g. / /dashboard");
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
const useAuth = existsSync(STATE);
console.log(`BASE=${BASE}  auth=${useAuth ? "yes (reusing saved session)" : "no (public routes only)"}`);

const browser = await chromium.launch();
let hadError = false;

for (const raw of (process.env.VIEWPORTS ?? "desktop,mobile").split(",")) {
  const v = raw.trim();
  const viewport = VP[v];
  if (!viewport) {
    console.error(`unknown viewport "${v}" — expected one of ${Object.keys(VP).join(", ")}`);
    continue;
  }

  const ctx = await browser.newContext({
    ...(useAuth ? { storageState: STATE } : {}),
    viewport,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  for (const r of routes) {
    const errs = [];
    const onConsole = (m) => m.type() === "error" && errs.push(m.text());
    const onPageError = (e) => errs.push(String(e));
    page.on("console", onConsole);
    page.on("pageerror", onPageError);

    let status = "ok";
    try {
      const resp = await page.goto(`${BASE}${r}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      status = resp ? String(resp.status()) : "no-resp";
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    } catch {
      status = "nav-error";
    }
    await page.waitForTimeout(500);

    // Detect an unexpected redirect: a protected route silently redirects to a
    // login/onboarding page when the saved session is missing/expired, and
    // page.goto still resolves with the final 200. Compare the final pathname
    // to the requested one (ignoring trailing slash + query).
    let redirectedTo = null;
    try {
      const want = new URL(r, BASE).pathname.replace(/\/$/, "") || "/";
      const got = new URL(page.url()).pathname.replace(/\/$/, "") || "/";
      if (want !== got) redirectedTo = got;
    } catch {
      /* unparseable URL — leave as no redirect */
    }

    const slug = r.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root";
    const file = `${OUT}/${slug}.${v}.png`;
    await page.screenshot({ path: file, fullPage: true }).catch(() => {});

    if (status === "nav-error" || Number(status) >= 400 || redirectedTo) hadError = true;
    const parts = [];
    if (redirectedTo) parts.push(`↪ redirected to ${redirectedTo}`);
    if (errs.length) parts.push(`⚠ ${errs.length} console err${errs.length > 1 ? "s" : ""}`);
    console.log(`${file}  [${status}] ${parts.join("  ")}`);
    if (errs.length) for (const e of errs.slice(0, 5)) console.log(`    · ${e.slice(0, 200)}`);

    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  }

  await ctx.close();
}

await browser.close();
process.exit(hadError ? 1 : 0);
