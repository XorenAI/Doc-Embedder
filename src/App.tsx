import {
  HashRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { Sidebar } from "./components/layout/Sidebar";
import { Dashboard } from "./pages/Dashboard";
import { ProjectsPage } from "./pages/Projects";
import { TitleBar } from "./components/layout/TitleBar";

import { ProjectDetails } from "./pages/ProjectDetails";

function App() {
  return (
    <Router>
      <div className="flex flex-col h-screen bg-background text-foreground font-sans selection:bg-primary/30 overflow-hidden">
        <TitleBar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 w-0 relative">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:id" element={<ProjectDetails />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}

export default App;
