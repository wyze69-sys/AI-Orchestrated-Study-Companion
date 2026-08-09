import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  resolveCutoff,
  requireMaintenanceSecret,
  resolveScopes,
  CLEANUP_SCOPES,
} from "./maintenance-cleanup.js";

describe("maintenance-cleanup logic", () => {
  const originalSecret = process.env.MAINTENANCE_SECRET;

  beforeEach(() => {
    process.env.MAINTENANCE_SECRET = originalSecret;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.MAINTENANCE_SECRET;
    else process.env.MAINTENANCE_SECRET = originalSecret;
  });

  test("resolveScopes validates and deduplicates", () => {
    assert.deepEqual(resolveScopes(["soft-deleted-sessions", "soft-deleted-sessions"]), [
      "soft-deleted-sessions",
    ]);
    assert.deepEqual(resolveScopes(CLEANUP_SCOPES), CLEANUP_SCOPES);
    assert.throws(() => resolveScopes([]), /At least one/);
    assert.throws(() => resolveScopes(["bogus"]), /Unknown cleanup scope/);
  });

  test("resolveCutoff computes UTC cutoff", () => {
    const cutoff = resolveCutoff(30, new Date("2026-08-09T12:00:00Z"));
    assert.equal(cutoff.toISOString(), "2026-07-10T12:00:00.000Z");
    assert.throws(() => resolveCutoff(-1), /non-negative/);
  });

  test("requireMaintenanceSecret is fail-closed without env secret", () => {
    delete process.env.MAINTENANCE_SECRET;
    assert.throws(() => requireMaintenanceSecret("anything"), /not configured/);
  });

  test("requireMaintenanceSecret rejects wrong or missing secret", () => {
    process.env.MAINTENANCE_SECRET = "correct-secret";
    assert.throws(() => requireMaintenanceSecret(undefined), /Invalid or missing/);
    assert.throws(() => requireMaintenanceSecret("wrong-secret"), /Invalid or missing/);
    assert.doesNotThrow(() => requireMaintenanceSecret("correct-secret"));
  });
});