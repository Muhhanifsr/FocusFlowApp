import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
if (import.meta.env.PROD && "serviceWorker" in navigator && (window.location.protocol === "https:" || isLocalhost)) {
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
    // The app remains usable when service workers are unavailable.
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
