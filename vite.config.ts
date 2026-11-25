import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import type { Plugin } from "vite";
import { nairobiRoutes } from "./src/data/routes";
import { buildStagesApi } from "./src/lib/integrations/stagesApi";

/** Publishes /api/v1/stages.json (Beacon's stages and routes) for partner apps such as Sakafind. */
function stagesApi(): Plugin {
  const body = () => JSON.stringify(buildStagesApi(nairobiRoutes), null, 1);
  return {
    name: "beacon-stages-api",
    configureServer(server) {
      server.middlewares.use("/api/v1/stages.json", (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.end(body());
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "api/v1/stages.json", source: body() });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), stagesApi()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
});
