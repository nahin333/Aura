import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { registerAuraServiceWorker } from "./lib/pwa";
import "./styles.css";

void registerAuraServiceWorker();

const root = document.getElementById("root");

if (!root) {
  throw new Error("Aura could not find its application root.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
