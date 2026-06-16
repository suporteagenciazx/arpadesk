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

  const clearProject = () => {
    setProject(null);
    localStorage.removeItem("arpadesk_project");
  };

  return (
    <ProjectContext.Provider value={{ project, selectProject, clearProject }}>
      {children}
    </ProjectContext.Provider>
  );
}

export const useProject = () => useContext(ProjectContext);
