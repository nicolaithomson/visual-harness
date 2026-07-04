# @nicolaithomson/visual-harness

Headless **authenticated-UI screenshot harness** + a **fail-closed dev login guard**,
framework-agnostic. Lets an agent (or CI) see the rendered, authenticated UI — real pixels
it can read back — so UI/UX defects stop slipping through.

Two portable pieces. The **third piece — a dev-only login seam — is app-specific and you
write it** (≈15 lines), using the guard shipped here. See "The seam you write" below.

## Install

```bash
npm i -D @nicolaithomson/visual-harness @playwright/test
npx playwright install chromium
```

## CLI

Two bins:

- `visual-login` — calls your dev-only login seam with the secret and saves an authenticated
  Playwright storage state, **only after** confirming a session cookie is present (never saves
  an unauthenticated state).
- `visual-shoot <route…>` — full-page PNGs at desktop (1440×900) + mobile (390×844), DPR 2;
  captures console/page errors; **exits non-zero on 4xx/5xx or an unexpected redirect** (e.g.
  expired session → `/login`), so it can't pass a login-page screenshot as authenticated.

Typical `package.json` wiring (Node ≥20 loads env with `--env-file`):

```json
{
  "scripts": {
    "visual:login": "node --env-file=.env.local node_modules/.bin/visual-login",
    "visual:shoot": "visual-shoot"
  }
}
```

```bash
npm run dev
npm run visual:login
npm run visual:shoot -- /dashboard /profile
```

### Config (env)

| Var | Default | Used by |
|-----|---------|---------|
| `BASE_URL` | `http://localhost:3000` | both |
| `E2E_LOGIN_SECRET` | — (required) | login |
| `E2E_LOGIN_PATH` | `/api/dev/e2e-login` | login |
| `AUTH_COOKIE_RE` | `^sb-.*-auth-token` | login (Supabase default; override for other auth) |
| `VISUAL_STATE` | `visual/.auth/session.json` | both |
| `VISUAL_OUT` | `visual/shots` | shoot |
| `VIEWPORTS` | `desktop,mobile` | shoot |

**Never commit** `visual/.auth/` (a live session credential) or `visual/shots/`.

## The guard (import it in your seam)

```ts
import { e2eLoginAllowed, e2eDevSurfaceEnabled } from "@nicolaithomson/visual-harness/guard";
```

- `e2eLoginAllowed(env, providedSecret)` → `true` only when **all** hold: not production
  (`NODE_ENV` / `VERCEL_ENV`), `E2E_LOGIN_ENABLED === "true"`, `E2E_LOGIN_SECRET` ≥ 16 chars,
  and the caller's secret matches in constant time (SHA-256 + `timingSafeEqual`). Any doubt →
  `false`. Respond **404, never 403**.
- `e2eDevSurfaceEnabled(env)` → env-only (no secret, no `node:crypto` need at call sites);
  Edge-middleware-safe. Use to gate the whole `/api/dev/*` surface.

## The seam you write (app-specific, ~15 lines)

A dev-only route that signs a seeded test user in **server-side** and lets your auth library
persist the session cookies, gated by the guard. Next.js + Supabase example:

```ts
// app/api/dev/e2e-login/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { e2eLoginAllowed } from "@nicolaithomson/visual-harness/guard";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-e2e-secret") ?? req.nextUrl.searchParams.get("secret");
  if (!e2eLoginAllowed(process.env, secret)) return new NextResponse("Not found", { status: 404 });

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: process.env.E2E_TEST_USER_EMAIL,
    password: process.env.E2E_TEST_USER_PASSWORD,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 401 });
  return NextResponse.json({ ok: true, user: { id: data.user?.id } });
}
```

For other frameworks/auth: same shape — guard first, sign in server-side, let the framework
persist cookies. Override `AUTH_COOKIE_RE` if your session cookie isn't `sb-…-auth-token`.

Unit-test the guard's matrix (prod→404, no-flag→404, short/absent/mismatched secret→404,
happy→200) — it's the load-bearing part.

## License

MIT
