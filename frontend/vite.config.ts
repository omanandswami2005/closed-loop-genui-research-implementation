import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: { input: { main: resolve(__dirname, "index.html"), demo: resolve(__dirname, "demo.html") } },
  },
  server: {
    proxy: { "/api": process.env.GENUI_API ?? "http://127.0.0.1:8000" },
  },
});
