async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    throw new Error("Rider database API is unavailable. Start it with npm run api.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The request could not be completed.");
  return data;
}

const post = (path, body = {}) => request(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  state: () => request("/api/state"),
  login: (email, password) => post("/api/auth/login", { email, password }),
  logout: () => post("/api/auth/logout"),
  advance: (id, stage) => post(`/api/tasks/${encodeURIComponent(id)}/progress`, { stage }),
  condition: (id, conditionStatus, conditionNote = "") => post(`/api/tasks/${encodeURIComponent(id)}/condition`, { conditionStatus, conditionNote }),
  submit: (id, counts, note = "") => post(`/api/tasks/${encodeURIComponent(id)}/submit`, { counts, note }),
  skip: (id, reason) => post(`/api/tasks/${encodeURIComponent(id)}/skip`, { reason }),
  complete: (id, reason) => post(`/api/tasks/${encodeURIComponent(id)}/complete`, { reason }),
  readAll: () => post("/api/notifications/read-all"),
};
