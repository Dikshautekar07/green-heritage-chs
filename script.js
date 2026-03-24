const appState = {
  user: null,
  complaintCategories: [],
  complaintStatuses: [],
  complaints: [],
  checklist: [],
  admin: null
};

document.addEventListener("DOMContentLoaded", initializeApp);

async function initializeApp() {
  await loadSession();
}

async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new Error(payload?.error || "Request failed.");
  }

  return payload;
}

async function loadSession() {
  try {
    const payload = await apiFetch("/api/session", { method: "GET" });
    appState.user = payload.user;
    appState.complaintCategories = payload.complaintCategories;
    appState.complaintStatuses = payload.complaintStatuses;

    if (appState.user) {
      await loadDashboard();
      return;
    }

    render();
  } catch (error) {
    render();
  }
}

async function loadDashboard() {
  const payload = await apiFetch("/api/dashboard", { method: "GET" });
  hydrateState(payload);
  render();
}

function hydrateState(payload) {
  appState.user = payload.user;
  appState.complaintCategories = payload.complaintCategories;
  appState.complaintStatuses = payload.complaintStatuses;
  appState.complaints = payload.complaints;
  appState.checklist = payload.checklist;
  appState.admin = payload.admin || null;
}

function render() {
  const app = document.getElementById("app");

  if (!appState.user) {
    app.innerHTML = document.getElementById("auth-template").innerHTML;
    bindAuthEvents();
    return;
  }

  if (appState.user.role === "admin") {
    app.innerHTML = document.getElementById("admin-template").innerHTML;
    renderAdminDashboard();
    bindAdminEvents();
    return;
  }

  app.innerHTML = document.getElementById("user-template").innerHTML;
  renderUserDashboard();
  bindUserEvents();
}

function bindAuthEvents() {
  const loginButton = document.querySelector('[data-auth-tab="login"]');
  const signupButton = document.querySelector('[data-auth-tab="signup"]');
  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");

  function switchTab(mode) {
    const isLogin = mode === "login";
    loginButton.classList.toggle("active", isLogin);
    signupButton.classList.toggle("active", !isLogin);
    loginForm.classList.toggle("hidden", !isLogin);
    signupForm.classList.toggle("hidden", isLogin);
    setMessage("auth-message", "");
  }

  loginButton.addEventListener("click", () => switchTab("login"));
  signupButton.addEventListener("click", () => switchTab("signup"));

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);

    try {
      const payload = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: String(formData.get("email")).trim(),
          password: String(formData.get("password"))
        })
      });

      appState.user = payload.user;
      await loadDashboard();
    } catch (error) {
      setMessage("auth-message", error.message);
    }
  });

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(signupForm);

    try {
      const payload = await apiFetch("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          name: String(formData.get("name")).trim(),
          flatNumber: String(formData.get("flatNumber")).trim(),
          email: String(formData.get("email")).trim(),
          password: String(formData.get("password"))
        })
      });

      appState.user = payload.user;
      await loadDashboard();
    } catch (error) {
      setMessage("auth-message", error.message);
    }
  });
}

function renderUserDashboard() {
  document.getElementById("user-greeting").textContent = `Namaste, ${appState.user.name}`;

  const categorySelect = document.querySelector('select[name="category"]');
  categorySelect.innerHTML = appState.complaintCategories
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join("");

  document.querySelector('input[name="flatNumber"]').value = appState.user.flatNumber;
  renderResidentChecklist();
  renderUserComplaints();
}

function renderResidentChecklist() {
  const container = document.getElementById("resident-checklist");
  if (!appState.checklist.length) {
    container.innerHTML = `<div class="empty-state">No checklist items added yet.</div>`;
    return;
  }

  container.innerHTML = appState.checklist
    .map(
      (item) => `
        <article class="stack-item ${item.completed ? "completed" : ""}">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <span>${item.completed ? "Completed for the day" : "Pending for today"}</span>
          </div>
          <span class="status-pill ${item.completed ? "status-completed" : "status-pending"}">
            ${item.completed ? "Done" : "Open"}
          </span>
        </article>
      `
    )
    .join("");
}

function renderUserComplaints() {
  const container = document.getElementById("user-complaints");
  if (!appState.complaints.length) {
    container.innerHTML = `<div class="empty-state">No complaints submitted yet.</div>`;
    return;
  }

  container.innerHTML = appState.complaints.map(createComplaintCard).join("");
  bindFeedbackForms();
}

function createComplaintCard(complaint) {
  return `
    <article class="card-item">
      <div class="card-head">
        <div>
          <h4>${escapeHtml(complaint.category)}</h4>
          <div class="complaint-meta">
            <span>Flat ${escapeHtml(complaint.flatNumber)}</span>
            <span>${escapeHtml(formatDate(complaint.createdAt))}</span>
          </div>
        </div>
        <span class="status-pill ${statusClassName(complaint.status)}">${escapeHtml(complaint.status)}</span>
      </div>
      <p>${escapeHtml(complaint.description)}</p>
      ${
        complaint.status === "Completed"
          ? complaint.feedback
            ? `<p class="feedback-note"><strong>Feedback:</strong> ${escapeHtml(complaint.feedback)}</p>`
            : `
              <form class="feedback-box" data-feedback-id="${complaint.id}">
                <label>
                  Share feedback
                  <textarea name="feedback" rows="3" placeholder="Tell us about the service experience" required></textarea>
                </label>
                <button class="primary-button" type="submit">Submit Feedback</button>
              </form>
            `
          : ""
      }
    </article>
  `;
}

function bindUserEvents() {
  document.getElementById("logout-button").addEventListener("click", logout);

  document.getElementById("complaint-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const payload = await apiFetch("/api/complaints", {
        method: "POST",
        body: JSON.stringify({
          flatNumber: String(formData.get("flatNumber")).trim(),
          category: String(formData.get("category")).trim(),
          description: String(formData.get("description")).trim()
        })
      });

      hydrateState(payload);
      render();
      setMessage("complaint-message", "Complaint submitted successfully.");
    } catch (error) {
      setMessage("complaint-message", error.message);
    }
  });
}

function bindFeedbackForms() {
  document.querySelectorAll("[data-feedback-id]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const complaintId = event.currentTarget.dataset.feedbackId;
      const feedback = String(new FormData(event.currentTarget).get("feedback")).trim();

      try {
        const payload = await apiFetch(`/api/complaints/${complaintId}/feedback`, {
          method: "POST",
          body: JSON.stringify({ feedback })
        });

        hydrateState(payload);
        render();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function renderAdminDashboard() {
  renderAdminMetrics();
  renderAdminComplaints();
  renderAdminChecklist();
  renderFeedback();
}

function renderAdminMetrics() {
  const metrics = appState.admin.metrics;
  document.getElementById("admin-metrics").innerHTML = `
    <article class="metric-card">
      <strong>${metrics.total}</strong>
      <span>Total Complaints</span>
    </article>
    <article class="metric-card">
      <strong>${metrics.pending}</strong>
      <span>Pending</span>
    </article>
    <article class="metric-card">
      <strong>${metrics.inProgress}</strong>
      <span>In Progress</span>
    </article>
    <article class="metric-card">
      <strong>${metrics.completed}</strong>
      <span>Completed</span>
    </article>
  `;
}

function renderAdminComplaints() {
  const container = document.getElementById("admin-complaints");
  if (!appState.complaints.length) {
    container.innerHTML = `<div class="empty-state">No complaints available.</div>`;
    return;
  }

  container.innerHTML = appState.complaints
    .map(
      (complaint) => `
        <article class="card-item">
          <div class="card-head">
            <div>
              <h4>${escapeHtml(complaint.category)}</h4>
              <div class="complaint-meta">
                <span>${escapeHtml(complaint.residentName)}</span>
                <span>Flat ${escapeHtml(complaint.flatNumber)}</span>
                <span>${escapeHtml(formatDate(complaint.createdAt))}</span>
              </div>
            </div>
            <span class="status-pill ${statusClassName(complaint.status)}">${escapeHtml(complaint.status)}</span>
          </div>
          <p>${escapeHtml(complaint.description)}</p>
          <div class="card-actions">
            <select data-status-select="${complaint.id}">
              ${appState.complaintStatuses
                .map(
                  (status) =>
                    `<option value="${escapeHtml(status)}" ${status === complaint.status ? "selected" : ""}>${escapeHtml(status)}</option>`
                )
                .join("")}
            </select>
            <button class="status-button" data-update-status="${complaint.id}" type="button">Update Status</button>
          </div>
        </article>
      `
    )
    .join("");
}

function renderAdminChecklist() {
  const container = document.getElementById("admin-checklist");
  if (!appState.checklist.length) {
    container.innerHTML = `<div class="empty-state">No checklist items added yet.</div>`;
    return;
  }

  container.innerHTML = appState.checklist
    .map(
      (item) => `
        <article class="stack-item ${item.completed ? "completed" : ""}">
          <label class="check-row">
            <input type="checkbox" data-toggle-check="${item.id}" ${item.completed ? "checked" : ""}>
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <span>${item.completed ? "Completed" : "Pending"}</span>
            </div>
          </label>
          <button class="remove-button" data-remove-task="${item.id}" type="button">Remove</button>
        </article>
      `
    )
    .join("");
}

function renderFeedback() {
  const container = document.getElementById("feedback-list");
  if (!appState.admin.feedback.length) {
    container.innerHTML = `<div class="empty-state">Feedback will appear here after residents respond.</div>`;
    return;
  }

  container.innerHTML = appState.admin.feedback
    .map(
      (item) => `
        <article class="card-item">
          <div class="card-head">
            <div>
              <h4>${escapeHtml(item.resident_name)}</h4>
              <div class="complaint-meta">
                <span>${escapeHtml(item.category)}</span>
                <span>Flat ${escapeHtml(item.flat_number)}</span>
              </div>
            </div>
            <span class="status-pill status-completed">Completed</span>
          </div>
          <p class="feedback-note">${escapeHtml(item.feedback)}</p>
        </article>
      `
    )
    .join("");
}

function bindAdminEvents() {
  document.getElementById("admin-logout-button").addEventListener("click", logout);
  document.getElementById("generate-report-button").addEventListener("click", openPrintableReport);
  document.getElementById("download-csv-button").addEventListener("click", downloadCsvReport);

  document.querySelectorAll("[data-update-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      const complaintId = button.dataset.updateStatus;
      const status = document.querySelector(`[data-status-select="${complaintId}"]`).value;

      try {
        const payload = await apiFetch(`/api/complaints/${complaintId}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status })
        });

        hydrateState(payload);
        render();
      } catch (error) {
        alert(error.message);
      }
    });
  });

  document.getElementById("checklist-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get("title")).trim();

    try {
      const payload = await apiFetch("/api/checklist", {
        method: "POST",
        body: JSON.stringify({ title })
      });

      hydrateState(payload);
      render();
    } catch (error) {
      alert(error.message);
    }
  });

  document.querySelectorAll("[data-toggle-check]").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      try {
        const payload = await apiFetch(`/api/checklist/${checkbox.dataset.toggleCheck}`, {
          method: "PATCH",
          body: JSON.stringify({ completed: checkbox.checked })
        });

        hydrateState(payload);
        render();
      } catch (error) {
        alert(error.message);
      }
    });
  });

  document.querySelectorAll("[data-remove-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const payload = await apiFetch(`/api/checklist/${button.dataset.removeTask}`, {
          method: "DELETE"
        });

        hydrateState(payload);
        render();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

async function logout() {
  await apiFetch("/api/auth/logout", { method: "POST" });
  appState.user = null;
  appState.complaints = [];
  appState.checklist = [];
  appState.admin = null;
  render();
}

function getComplaintSummary() {
  return {
    total: appState.complaints.length,
    pending: appState.complaints.filter((item) => item.status === "Pending").length,
    inProgress: appState.complaints.filter((item) => item.status === "In Progress").length,
    completed: appState.complaints.filter((item) => item.status === "Completed").length
  };
}

function buildPrintableReport() {
  const summary = getComplaintSummary();
  const generatedAt = formatDate(new Date().toISOString());

  const categoryRows = appState.admin.reports.categorySummary
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.category)}</td>
          <td>${item.count}</td>
        </tr>
      `
    )
    .join("");

  const complaintRows = appState.complaints.length
    ? appState.complaints
        .map(
          (complaint) => `
            <tr>
              <td>${escapeHtml(complaint.residentName)}</td>
              <td>${escapeHtml(complaint.flatNumber)}</td>
              <td>${escapeHtml(complaint.category)}</td>
              <td>${escapeHtml(complaint.status)}</td>
              <td>${escapeHtml(formatDate(complaint.createdAt))}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="5">No complaints registered yet.</td></tr>`;

  const checklistRows = appState.admin.reports.checklistHistory.length
    ? appState.admin.reports.checklistHistory
        .map(
          (item) => `
            <tr>
              <td>${escapeHtml(item.title)}</td>
              <td>${escapeHtml(item.completedAt ? formatDate(item.completedAt) : "-")}</td>
              <td>${escapeHtml(item.source)}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="3">No completed checklist items recorded yet.</td></tr>`;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Green Heritage CHS Report</title>
      <style>
        body { font-family: Arial, sans-serif; color: #173024; margin: 32px; }
        h1, h2 { margin: 0 0 12px; }
        p { margin: 0 0 10px; line-height: 1.5; }
        .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(120px, 1fr)); gap: 12px; margin: 24px 0; }
        .summary-card { border: 1px solid #c7d9cc; border-radius: 14px; padding: 16px; background: #f5faf6; }
        .summary-card strong { display: block; font-size: 28px; margin-bottom: 6px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #d8e6db; padding: 10px; text-align: left; font-size: 14px; }
        th { background: #eef6f0; }
        .section { margin-top: 28px; }
      </style>
    </head>
    <body>
      <h1>Green Heritage CHS, Kharghar</h1>
      <p>Complaint Status Report</p>
      <p>Generated on: ${escapeHtml(generatedAt)}</p>
      <div class="summary-grid">
        <div class="summary-card"><strong>${summary.total}</strong><span>Total Complaints</span></div>
        <div class="summary-card"><strong>${summary.pending}</strong><span>Pending</span></div>
        <div class="summary-card"><strong>${summary.inProgress}</strong><span>In Progress</span></div>
        <div class="summary-card"><strong>${summary.completed}</strong><span>Completed</span></div>
      </div>
      <section class="section">
        <h2>Category Summary</h2>
        <table>
          <thead><tr><th>Category</th><th>Registered Complaints</th></tr></thead>
          <tbody>${categoryRows}</tbody>
        </table>
      </section>
      <section class="section">
        <h2>Complaint Register</h2>
        <table>
          <thead><tr><th>Resident</th><th>Flat</th><th>Category</th><th>Status</th><th>Registered On</th></tr></thead>
          <tbody>${complaintRows}</tbody>
        </table>
      </section>
      <section class="section">
        <h2>Completed Checklist History</h2>
        <table>
          <thead><tr><th>Checklist Item</th><th>Completed On</th><th>Source</th></tr></thead>
          <tbody>${checklistRows}</tbody>
        </table>
      </section>
    </body>
    </html>
  `;
}

function openPrintableReport() {
  const reportWindow = window.open("", "_blank", "width=1100,height=800");
  if (!reportWindow) return;
  reportWindow.document.open();
  reportWindow.document.write(buildPrintableReport());
  reportWindow.document.close();
  reportWindow.focus();
  window.setTimeout(() => reportWindow.print(), 350);
}

function downloadCsvReport() {
  const rows = [
    ["Resident", "Flat Number", "Category", "Status", "Registered On", "Feedback"],
    ...appState.complaints.map((complaint) => [
      complaint.residentName,
      complaint.flatNumber,
      complaint.category,
      complaint.status,
      formatDate(complaint.createdAt),
      complaint.feedback || ""
    ]),
    [],
    ["Completed Checklist History"],
    ["Checklist Item", "Completed On", "Source"],
    ...appState.admin.reports.checklistHistory.map((item) => [
      item.title,
      item.completedAt ? formatDate(item.completedAt) : "",
      item.source
    ])
  ];

  const csv = rows
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "green-heritage-complaints-report.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function statusClassName(status) {
  if (status === "Completed") return "status-completed";
  if (status === "In Progress") return "status-progress";
  return "status-pending";
}

function setMessage(elementId, message, timeout = 2800) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = message;
  if (timeout && message) {
    window.setTimeout(() => {
      if (element.textContent === message) {
        element.textContent = "";
      }
    }, timeout);
  }
}

function formatDate(value) {
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
