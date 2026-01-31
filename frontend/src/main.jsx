import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { initApiBase } from "./services/api.js";
import "./index.css";
import { ToastProvider } from "./components/ui/ToastProvider.jsx";

const root = ReactDOM.createRoot(document.getElementById("root"));

(async () => {
  await initApiBase();

  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
})();
