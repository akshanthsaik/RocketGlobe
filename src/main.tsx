// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
// Archivo is self-hosted and declared in theme.css (public/fonts/*.woff2),
// so there is no font package import here.
import "cesium/Build/Cesium/Widgets/widgets.css";
import "./styles/theme.css";
import "./styles/globals.css";
import "./styles/animations.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
