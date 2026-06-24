import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { SessionProvider } from "./context/SessionContext";
import { AdminProvider } from "./context/AdminContext";
import { router } from "./router";
import "./i18n/config";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <SessionProvider>
        <AdminProvider>
          <RouterProvider router={router} />
        </AdminProvider>
      </SessionProvider>
    </ThemeProvider>
  </StrictMode>,
);
