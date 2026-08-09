import test from "node:test";
import assert from "node:assert/strict";
import { rateLimit, resetRateLimits } from "./rate-limit.js";

test("rateLimit middleware", async (t) => {
  t.afterEach(() => {
    resetRateLimits();
  });

  await t.test("normal requests pass under max limit", () => {
    const limiter = rateLimit({ scope: "test-normal", windowMs: 60000, max: 3 });
    const req = { ip: "127.0.0.1" };
    let passed = 0;

    for (let i = 0; i < 3; i++) {
      let nextCalled = false;
      const res = {};
      limiter(req, res, () => {
        nextCalled = true;
      });
      if (nextCalled) passed++;
    }

    assert.equal(passed, 3);
  });

  await t.test("requests exceeding limit return structured 429 JSON response with Retry-After header", () => {
    const limiter = rateLimit({ scope: "test-exceed", windowMs: 60000, max: 2, message: "Custom limit exceeded" });
    const req = { ip: "127.0.0.2" };

    limiter(req, {}, () => {});
    limiter(req, {}, () => {});

    let statusSet = null;
    let jsonSent = null;
    let headersSet = {};

    const res = {
      setHeader(k, v) {
        headersSet[k] = v;
      },
      status(s) {
        statusSet = s;
        return this;
      },
      json(payload) {
        jsonSent = payload;
      }
    };

    let nextCalled = false;
    limiter(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(statusSet, 429);
    assert.deepEqual(jsonSent, { error: "Custom limit exceeded" });
    assert.ok(headersSet["Retry-After"] !== undefined);
  });

  await t.test("separate limiter scopes behave independently", () => {
    const scopeA = rateLimit({ scope: "scopeA", windowMs: 60000, max: 1 });
    const scopeB = rateLimit({ scope: "scopeB", windowMs: 60000, max: 5 });
    const req = { ip: "127.0.0.3" };

    let scopeANext = false;
    scopeA(req, {}, () => { scopeANext = true; });
    assert.equal(scopeANext, true);

    let scopeABlocked = false;
    const resA = { status: () => resA, json: () => {}, setHeader: () => {} };
    scopeA(req, resA, () => { scopeABlocked = true; });
    assert.equal(scopeABlocked, false);

    let scopeBNext = false;
    scopeB(req, {}, () => { scopeBNext = true; });
    assert.equal(scopeBNext, true);
  });

  await t.test("resetRateLimits clears all stores and does not rely on process history", () => {
    const limiter = rateLimit({ scope: "test-reset", windowMs: 60000, max: 1 });
    const req = { ip: "127.0.0.4" };

    limiter(req, {}, () => {});

    let resBlocked = false;
    const res = { status: () => res, json: () => {}, setHeader: () => {} };
    limiter(req, res, () => { resBlocked = true; });
    assert.equal(resBlocked, false);

    resetRateLimits();

    let resResetPassed = false;
    limiter(req, {}, () => { resResetPassed = true; });
    assert.equal(resResetPassed, true);
  });

  await t.test("the reset header is honored only in the explicit test environment", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const limiter = rateLimit({ scope: "test-reset-header", windowMs: 60000, max: 1 });
    const req = { ip: "127.0.0.5", headers: { "x-reset-rate-limit": "1" } };
    const blockedResponse = { status: () => blockedResponse, json: () => {}, setHeader: () => {} };

    try {
      process.env.NODE_ENV = "staging";
      limiter(req, {}, () => {});
      let stagingPassed = false;
      limiter(req, blockedResponse, () => { stagingPassed = true; });
      assert.equal(stagingPassed, false);

      resetRateLimits();
      process.env.NODE_ENV = "test";
      limiter(req, {}, () => {});
      let testPassed = false;
      limiter(req, {}, () => { testPassed = true; });
      assert.equal(testPassed, true);
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
