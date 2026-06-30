import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
  process.env.GITHUB_SHA?.slice(0, 12) ||
  `local-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 12)}`;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
    __APP_BUILD_MODE__: JSON.stringify(mode),
  },
}));
