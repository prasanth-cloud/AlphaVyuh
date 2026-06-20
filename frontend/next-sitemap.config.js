/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: "https://alphavyuh.com",
  generateRobotsTxt: true,
  exclude: [
    "/dashboard",
    "/scanner",
    "/watchlist",
    "/charts/*",
    "/journal",
    "/settings/*",
    "/onboarding",
    "/upload",
    "/portfolio",
    "/alerts",
    "/data-status",
    "/feedback",
  ],
};
