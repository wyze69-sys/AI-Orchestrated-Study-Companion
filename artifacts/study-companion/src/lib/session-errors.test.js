import { test } from "node:test";
import assert from "node:assert/strict";
import { getSessionMutationError } from "./session-errors.js";

test("session creation error prefers the API error message", () => {
  assert.equal(
    getSessionMutationError({ data: { error: "Title is required" } }),
    "Title is required",
  );
});

test("session creation error supports plain API text and Error messages", () => {
  assert.equal(getSessionMutationError({ data: "Request failed" }), "Request failed");
  assert.equal(getSessionMutationError(new Error("Network unavailable")), "Network unavailable");
});

test("session creation error always has a safe fallback", () => {
  assert.equal(
    getSessionMutationError({ data: {} }),
    "Unable to create the study session. Please try again.",
  );
});
