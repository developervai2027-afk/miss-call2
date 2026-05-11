// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Ensures env vars with VITE_ prefix are exposed to client
  envPrefix: "VITE_",
  build: {
    outDir: "dist",
    sourcemap: false,  // disable in production for security
  },
  server: {
    port: 5173,
    // Required for WebRTC getUserMedia in dev (needs HTTPS or localhost)
    https: false,
  },
});
