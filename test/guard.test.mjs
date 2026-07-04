// Fail-closed matrix for the E2E login guard — the load-bearing test.
// Zero dependencies: Node's built-in test runner (`node --test`).
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { constantTimeEqual, e2eDevSurfaceEnabled, e2eLoginAllowed } from "../src/guard.mjs";

const SECRET = "a-sufficiently-long-secret-0123456789"; // >= 16 chars

const validEnv = (o = {}) => ({
  NODE_ENV: "development",
  VERCEL_ENV: "preview",
  E2E_LOGIN_ENABLED: "true",
  E2E_LOGIN_SECRET: SECRET,
  ...o,
});

describe("e2eLoginAllowed — fail-closed matrix", () => {
  it("allows the happy path", () => {
    assert.equal(e2eLoginAllowed(validEnv(), SECRET), true);
  });
  it("is inert when NODE_ENV=production", () => {
    assert.equal(e2eLoginAllowed(validEnv({ NODE_ENV: "production" }), SECRET), false);
  });
  it("is inert when VERCEL_ENV=production", () => {
    assert.equal(e2eLoginAllowed(validEnv({ VERCEL_ENV: "production" }), SECRET), false);
  });
  it("is inert when the flag is absent or not exactly 'true'", () => {
    assert.equal(e2eLoginAllowed(validEnv({ E2E_LOGIN_ENABLED: undefined }), SECRET), false);
    for (const v of ["1", "yes", "TRUE", "true ", "", "false"]) {
      assert.equal(e2eLoginAllowed(validEnv({ E2E_LOGIN_ENABLED: v }), SECRET), false);
    }
  });
  it("rejects a missing or too-short configured secret", () => {
    assert.equal(e2eLoginAllowed(validEnv({ E2E_LOGIN_SECRET: undefined }), SECRET), false);
    assert.equal(e2eLoginAllowed(validEnv({ E2E_LOGIN_SECRET: "short-secret" }), "short-secret"), false);
  });
  it("rejects when the caller provides no secret", () => {
    assert.equal(e2eLoginAllowed(validEnv(), null), false);
    assert.equal(e2eLoginAllowed(validEnv(), undefined), false);
    assert.equal(e2eLoginAllowed(validEnv(), ""), false);
  });
  it("rejects a mismatched provided secret", () => {
    assert.equal(e2eLoginAllowed(validEnv(), `${SECRET}-wrong`), false);
  });
});

describe("e2eDevSurfaceEnabled", () => {
  it("true only in non-prod with the flag on", () => {
    assert.equal(e2eDevSurfaceEnabled({ NODE_ENV: "development", E2E_LOGIN_ENABLED: "true" }), true);
    assert.equal(e2eDevSurfaceEnabled({ NODE_ENV: "production", E2E_LOGIN_ENABLED: "true" }), false);
    assert.equal(e2eDevSurfaceEnabled({ VERCEL_ENV: "production", E2E_LOGIN_ENABLED: "true" }), false);
    assert.equal(e2eDevSurfaceEnabled({ NODE_ENV: "development" }), false);
  });
});

describe("constantTimeEqual", () => {
  it("true for equal, false for different, no throw on length mismatch", () => {
    assert.equal(constantTimeEqual(SECRET, SECRET), true);
    assert.equal(constantTimeEqual("", ""), true);
    assert.equal(constantTimeEqual("abc", "abd"), false);
    assert.doesNotThrow(() => constantTimeEqual("short", "a-much-longer-value"));
    assert.equal(constantTimeEqual("short", "a-much-longer-value"), false);
  });
});
