import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { rateLimiter } from "@/lib/auth/rate-limit";

describe("password hashing", () => {
  it("verifies the right password only", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batter", hash)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("rejects malformed hashes", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$abc")).toBe(false);
  });
});

describe("rate limiter", () => {
  it("allows max hits per window, then resets", () => {
    const limit = rateLimiter(2, 1000);
    expect(limit.take("a", 0)).toBe(true);
    expect(limit.take("a", 10)).toBe(true);
    expect(limit.take("a", 20)).toBe(false);
    expect(limit.take("b", 20)).toBe(true);
    expect(limit.take("a", 1000)).toBe(true);
  });

  it("can be cleared for a key", () => {
    const limit = rateLimiter(1, 1000);
    limit.take("a", 0);
    limit.reset("a");
    expect(limit.take("a", 1)).toBe(true);
  });
});
