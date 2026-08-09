import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizeEmail, validateAuthInput } from "./auth-validation.js";

describe("auth-validation", () => {
  test("normalizeEmail trims, lowercases, and returns normalized value", () => {
    assert.equal(normalizeEmail("  User@Example.COM  "), "user@example.com");
    assert.equal(normalizeEmail("Foo.Bar@baz.io"), "foo.bar@baz.io");
  });

  test("normalizeEmail rejects malformed, overlong, or whitespace-containing emails", () => {
    assert.equal(normalizeEmail("not-an-email"), null);
    assert.equal(normalizeEmail("a@b"), null);
    assert.equal(normalizeEmail("a b@example.com"), null);
    assert.equal(normalizeEmail("a@b.c"), null);
    assert.equal(normalizeEmail("a".repeat(65) + "@example.com"), null);
    assert.equal(normalizeEmail("x@example.com" + "x".repeat(300)), null);
    assert.equal(normalizeEmail(""), null);
    assert.equal(normalizeEmail(42), null);
  });

  test("validateAuthInput accepts valid credentials", () => {
    const result = validateAuthInput({ email: "  Student@School.edu ", password: "password123" });
    assert.equal(result.ok, true);
    assert.equal(result.email, "student@school.edu");
    assert.equal(result.password, "password123");
  });

  test("validateAuthInput rejects missing or short password", () => {
    assert.equal(validateAuthInput({ email: "a@b.co", password: "short" }).ok, false);
    assert.equal(validateAuthInput({ email: "a@b.co", password: "" }).ok, false);
    assert.equal(validateAuthInput({ email: "a@b.co" }).ok, false);
  });

  test("validateAuthInput rejects invalid email or non-object body", () => {
    assert.equal(validateAuthInput(null).ok, false);
    assert.equal(validateAuthInput({ email: "nope", password: "password123" }).ok, false);
    assert.equal(validateAuthInput({}).ok, false);
  });
});