import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/invite/",
        "/home",
        "/people",
        "/groups",
        "/debts",
        "/records",
        "/stats",
        "/payments",
        "/bills",
        "/inbox",
        "/account",
        "/onboarding",
        "/search",
      ],
    },
  };
}
