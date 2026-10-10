export interface VersusContext { course: string; returnTo: string }

// Only real correspondences. Analysis has no Versus bank yet.
export const courseSubjects: Record<string, string> = {
  "computer-architecture": "ddca",
  "linear-algebra": "linear",
  informatics: "programming",
};

export function parseVersusContext(search: string): VersusContext {
  const params = new URLSearchParams(search);
  const course = params.get("course") || "";
  const returnTo = params.get("returnTo") || "/";
  return {
    course: /^[a-z0-9-]{1,80}$/.test(course) ? course : "",
    returnTo: /^\/#\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+){0,3})?$/.test(returnTo) ? returnTo : "/",
  };
}

export function loadVersusContext(): VersusContext {
  const key = "viscon:versus-context";
  try {
    const search = new URLSearchParams(location.search);
    if (search.has("course") || search.has("returnTo")) {
      const context = parseVersusContext(location.search);
      sessionStorage.setItem(key, new URLSearchParams({ ...context }).toString());
      return context;
    }
    return parseVersusContext(sessionStorage.getItem(key) || "");
  } catch {
    return parseVersusContext(location.search);
  }
}
