import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/services/auth", () => ({ auth: vi.fn() }));
import proxy from "@/proxy";

describe("request routing", () => {
  it("rewrites a public login page without redirecting to itself", async () => {
    const response = await proxy(new NextRequest("http://localhost:3102/login"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBe("http://localhost:3102/id/login");
  });
  it("redirects protected pages to login", async () => {
    const response = await proxy(new NextRequest("http://localhost:3102/people"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3102/login?next=%2Fpeople");
  });
});
