import { createApp } from "vue";

import "./ui/tokens.css";
import "./ui/base.css";
import "./ui/layout.css";
import "./ui/components.css";
import App from "./App.vue";

async function boot() {
  /* Demo build only: install the in-browser device stand-in before the app makes
     its first request. Gated on MODE so the firmware build tree-shakes it out. */
  if (import.meta.env.MODE === "demo") {
    const { installDemoBackend } = await import("./demo/backend");
    installDemoBackend();
  }
  createApp(App).mount("#app");
}

boot();
