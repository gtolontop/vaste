import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";

// Ensure we have a visible runtime log so users can see the app bundle loaded in DevTools
try {
  // eslint-disable-next-line no-console
  console.log("[CLIENT] main bundle loaded");
} catch (e) {}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
