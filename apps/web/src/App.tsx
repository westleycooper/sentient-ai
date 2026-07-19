import { Routes, Route, Navigate } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { ConfigPage } from "./pages/ConfigPage";
import { AgentPage } from "./pages/AgentPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/agent" element={<AgentPage />} />
      <Route path="/config" element={<ConfigPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
