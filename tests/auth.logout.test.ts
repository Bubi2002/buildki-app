import { describe, expect, it } from "vitest";

import { serializeClearedSessionCookie } from "../server/auth-local";
import { COOKIE_NAME } from "../shared/const";

describe("auth.logout cookie policy", () => {
  it("clears the session cookie with the non-production policy", () => {
    const cookie = serializeClearedSessionCookie(false);

    expect(cookie).toContain(`${COOKIE_NAME}=`);
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
  });

  it("adds the Secure attribute in production", () => {
    const cookie = serializeClearedSessionCookie(true);

    expect(cookie).toContain(`${COOKIE_NAME}=`);
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
  });
});
