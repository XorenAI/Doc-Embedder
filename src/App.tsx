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
import { ThemeProvider } from "./components/ThemeProvider";

import { ProjectDetails } from "./pages/ProjectDetails";
import { VectorStores } from "./pages/VectorStores";
import { Playground } from "./pages/Playground";
import { Settings } from "./pages/Settings";

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="app_settings">
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
                <Route path="/vector-store" element={<VectorStores />} />
                <Route path="/playground" element={<Playground />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;
