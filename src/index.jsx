import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { CallProvider } from "./Context.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <CallProvider>
      <App />
    </CallProvider>
  </StrictMode>,
);
