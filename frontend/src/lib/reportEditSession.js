const SESSION_KEY = "arpadesk_report_edit";
const RELOAD_FLAG_KEY = "arpadesk_report_edit_reload";

export function setReportEditSession(projectId, periodStart, periodEnd) {
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        projectId: String(projectId),
        periodStart,
        periodEnd,
      })
    );
  } catch {
    /* ignore */
  }
}

export function clearReportEditSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(RELOAD_FLAG_KEY);
  } catch {
    /* ignore */
  }
}

export function getReportEditSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function matchesReportEditSession(projectId, periodStart, periodEnd) {
  const session = getReportEditSession();
  if (!session) return false;
  return (
    session.projectId === String(projectId) &&
    session.periodStart === periodStart &&
    session.periodEnd === periodEnd
  );
}

export function markReportEditReload() {
  try {
    if (getReportEditSession()) {
      sessionStorage.setItem(RELOAD_FLAG_KEY, "1");
    }
  } catch {
    /* ignore */
  }
}

export function wasReportEditReload() {
  try {
    const flag = sessionStorage.getItem(RELOAD_FLAG_KEY) === "1";
    if (flag) sessionStorage.removeItem(RELOAD_FLAG_KEY);
    return flag;
  } catch {
    return false;
  }
}

export function isPageReload() {
  try {
    const [nav] = performance.getEntriesByType("navigation");
    return nav?.type === "reload";
  } catch {
    return false;
  }
}
