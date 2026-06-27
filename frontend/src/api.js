export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }
  return data;
}

export const api = {
  health: () => request("/api/health"),
  packages: () => request("/api/packages"),
  dashboard: () => request("/api/dashboard"),
  leads: (query = "") => request(`/api/leads${query}`),
  createLead: (payload) => request("/api/leads", { method: "POST", body: JSON.stringify(payload) }),
  getLead: (id) => request(`/api/leads/${id}`),
  deleteLead: (id) => request(`/api/leads/${id}`, { method: "DELETE" }),
  updateStatus: (id, payload) => request(`/api/leads/${id}/status`, { method: "PUT", body: JSON.stringify(payload) }),
  addFollowup: (id, payload) => request(`/api/leads/${id}/followup`, { method: "POST", body: JSON.stringify(payload) }),
  recommend: (payload) => request("/api/ai/recommend", { method: "POST", body: JSON.stringify(payload) }),
  agentRegister: (payload) => request("/api/auth/agent-register", { method: "POST", body: JSON.stringify(payload) }),
  agentLogin: (payload) => request("/api/auth/agent-login", { method: "POST", body: JSON.stringify(payload) }),
  forgotPassword: (payload) => request("/api/auth/forgot-password", { method: "POST", body: JSON.stringify(payload) }),
  resetPassword: (payload) => request("/api/auth/reset-password", { method: "POST", body: JSON.stringify(payload) }),
  availability: (date, excludeLeadId = "") => request(`/api/availability?date=${encodeURIComponent(date || "")}&excludeLeadId=${encodeURIComponent(excludeLeadId)}`),
  validateBooking: (payload) => request("/api/bookings/validate", { method: "POST", body: JSON.stringify(payload) }),
  processLead: (id, payload) => request(`/api/leads/${id}/process`, { method: "POST", body: JSON.stringify(payload) }),
  updatePayment: (id, payload) => request(`/api/leads/${id}/payment`, { method: "PUT", body: JSON.stringify(payload) }),
  notificationPreview: (payload) => request("/api/notifications/preview", { method: "POST", body: JSON.stringify(payload) }),
  generateAutomatedMessages: (id, payload = {}) => request(`/api/automation/messages/${id}`, { method: "POST", body: JSON.stringify(payload) }),
  dueReminders: (date = "") => request(`/api/reminders/due${date ? `?date=${encodeURIComponent(date)}` : ""}`),
  alerts: (query = "") => request(`/api/alerts${query}`),
  deleteAlert: (id) => request(`/api/alerts/${id}`, { method: "DELETE" }),
  clearAlerts: (query = "") => request(`/api/alerts${query}`, { method: "DELETE" }),
  clearLeadAlerts: (id) => request(`/api/leads/${id}/alerts`, { method: "DELETE" }),
  emailStatus: () => request("/api/email/status"),
  testEmail: (payload) => request("/api/email/test", { method: "POST", body: JSON.stringify(payload) }),
  sendAlertEmail: (id, payload = {}) => request(`/api/email/alerts/${id}/send`, { method: "POST", body: JSON.stringify(payload) }),
  reportSummary: () => request("/api/reports/summary")
};
