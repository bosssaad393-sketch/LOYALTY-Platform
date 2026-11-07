import { describe, expect, it } from "vitest";
import config, { csp, securityHeaders } from "../next.config";

// The headers every page and API answer carries. A change here changes what browsers allow, so it is pinned by a test.

describe("security headers", () => {
  it("are sent on every path", async () => {
    const rules = await config.headers!();
    expect(rules).toEqual([{ source: "/:path*", headers: securityHeaders }]);
  });
  it("forbid framing and type sniffing, and limit the referrer", () => {
    const h = Object.fromEntries(securityHeaders.map((x) => [x.key, x.value]));
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Permissions-Policy"]).toContain("camera=(self)");
    expect(h["Permissions-Policy"]).toContain("microphone=()");
  });
  it("the content policy allows our own files, Supabase photos and Tap, and nothing that frames us", () => {
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toMatch(/img-src [^;]*https:\/\/\*\.supabase\.co/);
    expect(csp).toMatch(/form-action [^;]*https:\/\/\*\.tap\.company/);
    expect(csp).toMatch(/frame-src [^;]*https:\/\/\*\.tap\.company/);
  });
});
