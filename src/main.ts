import { createApp } from "vue";

import "./ui/tokens.css";
import "./ui/base.css";
import "./ui/layout.css";
import "./ui/components.css";
import App from "./App.vue";
import { editorFromLink, followsDevice, languageToOffer, loadDeviceLanguage, takeLanguageLink } from "./i18n";
import { toast } from "./state/toasts";

async function boot() {
  /* Demo build only: install the in-browser device stand-in before the app makes
     its first request. Gated on MODE so the firmware build tree-shakes it out. */
  if (import.meta.env.MODE === "demo") {
    const { installDemoBackend } = await import("./demo/backend");
    installDemoBackend();
  }
  /* The device's own language, for a browser with no choice of its own. Waited
     for briefly so the console does not open in English and switch. */
  if (followsDevice()) {
    await Promise.race([loadDeviceLanguage(), new Promise((r) => setTimeout(r, 1500))]);
  } else {
    void loadDeviceLanguage();
  }
  /* A link from the site's translations page: a language, and the editor. */
  const edit = await takeLanguageLink().catch(() => null);
  if (edit) editorFromLink.value = edit;
  createApp(App).mount("#app");
  /* The console in the browser's own language, offered once, in that language. */
  const offer = await languageToOffer();
  if (offer) toast.info(offer);
}

boot();
