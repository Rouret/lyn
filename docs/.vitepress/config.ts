import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Lyn",
  description: "A lightweight, type-safe backend framework for Bun",
  base: "/lyn/",
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/introduction", activeMatch: "^/(guide|essentials|integrations|guides)/" },
      { text: "Configuration", link: "/configuration/overview", activeMatch: "^/configuration/" },
      { text: "Reference", link: "/reference/api", activeMatch: "^/reference/" },
      {
        text: "v1.0.0",
        items: [
          { text: "Roadmap", link: "https://github.com/Rouret/lyn#roadmap" },
          { text: "Contributing", link: "https://github.com/Rouret/lyn/blob/main/CONTRIBUTING.md" },
        ],
      },
    ],
    sidebar: [
      {
        text: "Introduction",
        items: [
          { text: "What is Lyn?", link: "/guide/introduction" },
          { text: "Getting started", link: "/guide/getting-started" },
          { text: "Project structure", link: "/guide/project-structure" },
        ],
      },
      {
        text: "Essentials",
        items: [
          { text: "Routing", link: "/essentials/routing" },
          { text: "Handlers", link: "/essentials/handlers" },
          { text: "Validation", link: "/essentials/validation" },
          { text: "Errors", link: "/essentials/errors" },
          { text: "Server", link: "/essentials/server" },
        ],
      },
      {
        text: "Configuration",
        items: [
          { text: "Overview", link: "/configuration/overview" },
          { text: "Environment variables", link: "/configuration/environment-variables" },
          { text: "CORS", link: "/configuration/cors" },
          { text: "Rate limiting", link: "/configuration/rate-limiting" },
          { text: "Logging", link: "/configuration/logging" },
        ],
      },
      {
        text: "Integrations",
        items: [
          { text: "Database", link: "/integrations/database" },
          { text: "Migrations", link: "/integrations/migrations" },
        ],
      },
      {
        text: "Guides",
        items: [
          { text: "Best practices", link: "/guides/best-practices" },
          { text: "Testing", link: "/guides/testing" },
          { text: "Performance", link: "/guides/performance" },
          { text: "Production", link: "/guides/production" },
        ],
      },
      {
        text: "Reference",
        items: [{ text: "API", link: "/reference/api" }],
      },
    ],
    outline: { level: [2, 3], label: "On this page" },
    socialLinks: [{ icon: "github", link: "https://github.com/Rouret/lyn" }],
    editLink: {
      pattern: "https://github.com/Rouret/lyn/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
    search: { provider: "local" },
    footer: { message: "Released under the MIT License." },
  },
});
