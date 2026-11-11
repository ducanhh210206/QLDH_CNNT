import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import GatewayAlert from "./components/GatewayAlert";
import "./styles/global.css";
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <GatewayAlert />
    <App />
  </React.StrictMode>,
);
