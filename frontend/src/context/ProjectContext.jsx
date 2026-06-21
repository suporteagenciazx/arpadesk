import { createContext, useContext, useEffect, useState } from "react";

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const [project, setProject] = useState(() => {
    const raw = localStorage.getItem("arpadesk_project");
    return raw ? JSON.parse(raw) : null;
  });

  const selectProject = (p) => {
    setProject(p);
    localStorage.setItem("arpadesk_project", JSON.stringify(p));
  };

  const updateProjectSettings = (partialSettings) => {
    setProject((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        settings: { ...(prev.settings || {}), ...partialSettings },
      };
      localStorage.setItem("arpadesk_project", JSON.stringify(next));
      return next;
    });
  };

  const clearProject = () => {
    setProject(null);
    localStorage.removeItem("arpadesk_project");
  };

  return (
    <ProjectContext.Provider value={{ project, selectProject, updateProjectSettings, clearProject }}>
      {children}
    </ProjectContext.Provider>
  );
}

export const useProject = () => useContext(ProjectContext);
