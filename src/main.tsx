import { StrictMode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      void getCurrentWindow().show().catch(() => {});
    })
  );
}
