import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const settings = loadEnv(mode, process.cwd(), "API_");
  const target = settings.API_PROXY_TARGET || "http://127.0.0.1:5000";
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": target,
        "/health": target,
      },
    },
  };
});
