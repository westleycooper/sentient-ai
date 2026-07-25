/**
 * Entry point for the STANDALONE showcase build (GitHub Pages).
 * Built by vite.showcase.config.ts into docs/showcase/ — no backend, no app
 * routes, so ShowcasePage runs in standalone mode inside a MemoryRouter
 * (its useNavigate hook needs a router context even though standalone mode
 * never navigates).
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { CssBaseline } from "@mui/material";
import { ShowcasePage } from "./pages/ShowcasePage";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MemoryRouter>
      <CssBaseline />
      <ShowcasePage standalone />
    </MemoryRouter>
  </React.StrictMode>
);
