import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { registerRateLimitTestResetRoute } from "./rate-limit-test-reset.js";

async function withAppForEnvironment(environment, verify) {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = environment;

  try {
    const app = express();
    registerRateLimitTestResetRoute(app);
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();

    try {
      await verify(`http://127.0.0.1:${port}`);
    } finally {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
}

test("rate-limit reset endpoint is exposed only in the test environment", async (t) => {
  await t.test("available with NODE_ENV=test", async () => {
    await withAppForEnvironment("test", async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/test/reset-rate-limits`, { method: "POST" });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { success: true, message: "Rate limit stores cleared" });
    });
  });

  for (const environment of ["production", "staging", "development"]) {
    await t.test(`unavailable with NODE_ENV=${environment}`, async () => {
      await withAppForEnvironment(environment, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/test/reset-rate-limits`, { method: "POST" });
        assert.equal(response.status, 404);
      });
    });
  }
});
