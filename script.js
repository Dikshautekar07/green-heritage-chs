const STORAGE_KEY = "green-heritage-chs-app";

const complaintCategories = [
  "Housekeeping",
  "Plumbing",
  "Electrical",
  "Club House",
  "Civil Work",
  "Account",
  "Internal Leakage"
];

const complaintStatuses = ["Pending", "In Progress", "Completed"];

const initialState = {
  currentUserId: null,
  users: [
    {
      id: "admin-1",
      name: "Society Admin",
      flatNumber: "Office",
      email: "admin@greenheritage.in",
      password: "admin123",
      role: "admin"
    }
  ],
  complaints: [
    {
      id: "cmp-1",
      userId: "admin-1",
      residentName: "Sample Resident",
      flatNumber: "B-204",
      category: "Housekeeping",
      description: "Lobby cleaning needed near the lift area.",
      status: "Pending",
      feedback: "",
      createdAt: "2026-03-21T08:30:00.000Z"
    }
  ],
  checklist: [
    { id: "task-1", title: "Check water tank motor operation", completed: true },
    { id: "task-2", title: "Inspect lift lobby cleanliness", completed: false },
    { id: "task-3", title: "Verify clubhouse lighting", completed: false }
  ]
};

function cloneState(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initialState));
    return cloneState(initialState);
  }

  try {
    return JSON.parse(saved);
  } catch (error) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initialState));
    return cloneState(initialState);
  }
}

let state = loadState();

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid(prefix) {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return `${prefix}-${window.crypto.randomUUID().slice(0, 8)}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function getCurrentUser() {
  return state.users.find((user) => user.id === state.currentUserId) || null;
}

function setMessage(elementId, message, timeout = 2800) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = message;

  if (timeout) {
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

function render() {
  const app = document.getElementById("app");
  const currentUser = getCurrentUser();

  if (!currentUser) {
    app.innerHTML = document.getElementById("auth-template").innerHTML;
    bindAuthEvents();
    return;
  }

  if (currentUser.role === "admin") {
    app.innerHTML = document.getElementById("admin-template").innerHTML;
    renderAdminDashboard();
    bindAdminEvents();
    return;
  }

  app.innerHTML = document.getElementById("user-template").innerHTML;
  renderUserDashboard(currentUser);
  bindUserEvents(currentUser);
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
    setMessage("auth-message", "", 0);
  }

  loginButton.addEventListener("click", () => switchTab("login"));
  signupButton.addEventListener("click", () => switchTab("signup"));

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    const email = String(formData.get("email")).trim().toLowerCase();
    const password = String(formData.get("password")).trim();

    const user = state.users.find(
      (item) => item.email.toLowerCase() === email && item.password === password
    );

    if (!user) {
      setMessage("auth-message", "Invalid email or password.");
      return;
    }

    state.currentUserId = user.id;
    saveState();
    render();
  });

  signupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(signupForm);
    const name = String(formData.get("name")).trim();
    const flatNumber = String(formData.get("flatNumber")).trim();
    const email = String(formData.get("email")).trim().toLowerCase();
    const password = String(formData.get("password")).trim();

    const existingUser = state.users.some((user) => user.email.toLowerCase() === email);
    if (existingUser) {
      setMessage("auth-message", "An account with this email already exists.");
      return;
    }

    const newUser = {
      id: uid("user"),
      name,
      flatNumber,
      email,
      password,
      role: "resident"
    };

    state.users.push(newUser);
    state.currentUserId = newUser.id;
    saveState();
    render();
  });
}

function renderUserDashboard(user) {
  document.getElementById("user-greeting").textContent = `Namaste, ${user.name}`;

  const categorySelect = document.querySelector('select[name="category"]');
  categorySelect.innerHTML = complaintCategories
    .map((category) => `<option value="${category}">${category}</option>`)
    .join("");

  const flatInput = document.querySelector('input[name="flatNumber"]');
  flatInput.value = user.flatNumber;

  renderResidentChecklist();
  renderUserComplaints(user);
}

function renderResidentChecklist() {
  const container = document.getElementById("resident-checklist");
  if (!state.checklist.length) {
    container.innerHTML = `<div class="empty-state">No checklist items added yet.</div>`;
    return;
  }

  container.innerHTML = state.checklist
    .map(
      (item) => `
        <article class="stack-item ${item.completed ? "completed" : ""}">
          <div>
            <strong>${item.title}</strong>
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

function renderUserComplaints(user) {
  const container = document.getElementById("user-complaints");
  const complaints = state.complaints
    .filter((complaint) => complaint.userId === user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (!complaints.length) {
    container.innerHTML = `<div class="empty-state">No complaints submitted yet.</div>`;
    return;
  }

  container.innerHTML = complaints.map(createComplaintCard).join("");
  bindFeedbackForms();
}

function createComplaintCard(complaint) {
  const statusClass =
    complaint.status === "Completed"
      ? "status-completed"
      : complaint.status === "In Progress"
        ? "status-progress"
        : "status-pending";

  return `
    <article class="card-item">
      <div class="card-head">
        <div>
          <h4>${complaint.category}</h4>
          <div class="complaint-meta">
            <span>Flat ${complaint.flatNumber}</span>
            <span>${formatDate(complaint.createdAt)}</span>
          </div>
        </div>
        <span class="status-pill ${statusClass}">${complaint.status}</span>
      </div>
      <p>${complaint.description}</p>
      ${
        complaint.status === "Completed"
          ? complaint.feedback
            ? `<p class="feedback-note"><strong>Feedback:</strong> ${complaint.feedback}</p>`
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

function bindUserEvents(user) {
  document.getElementById("logout-button").addEventListener("click", logout);

  document.getElementById("complaint-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    const complaint = {
      id: uid("cmp"),
      userId: user.id,
      residentName: user.name,
      flatNumber: String(formData.get("flatNumber")).trim(),
      category: String(formData.get("category")).trim(),
      description: String(formData.get("description")).trim(),
      status: "Pending",
      feedback: "",
      createdAt: new Date().toISOString()
    };

    state.complaints.push(complaint);
    saveState();
    form.reset();
    document.querySelector('input[name="flatNumber"]').value = user.flatNumber;
    render();
    setMessage("complaint-message", "Complaint submitted successfully.");
  });
}

function bindFeedbackForms() {
  document.querySelectorAll("[data-feedback-id]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const complaintId = event.currentTarget.dataset.feedbackId;
      const formData = new FormData(event.currentTarget);
      const feedback = String(formData.get("feedback")).trim();
      const complaint = state.complaints.find((item) => item.id === complaintId);

      if (!complaint) return;

      complaint.feedback = feedback;
      saveState();
      render();
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
  const container = document.getElementById("admin-metrics");
  const pending = state.complaints.filter((item) => item.status === "Pending").length;
  const progress = state.complaints.filter((item) => item.status === "In Progress").length;
  const completed = state.complaints.filter((item) => item.status === "Completed").length;

  container.innerHTML = `
    <article class="metric-card">
      <strong>${state.complaints.length}</strong>
      <span>Total Complaints</span>
    </article>
    <article class="metric-card">
      <strong>${pending}</strong>
      <span>Pending</span>
    </article>
    <article class="metric-card">
      <strong>${progress}</strong>
      <span>In Progress</span>
    </article>
    <article class="metric-card">
      <strong>${completed}</strong>
      <span>Completed</span>
    </article>
  `;
}

function renderAdminComplaints() {
  const container = document.getElementById("admin-complaints");
  const complaints = [...state.complaints].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (!complaints.length) {
    container.innerHTML = `<div class="empty-state">No complaints available.</div>`;
    return;
  }

  container.innerHTML = complaints
    .map(
      (complaint) => `
        <article class="card-item">
          <div class="card-head">
            <div>
              <h4>${complaint.category}</h4>
              <div class="complaint-meta">
                <span>${complaint.residentName}</span>
                <span>Flat ${complaint.flatNumber}</span>
                <span>${formatDate(complaint.createdAt)}</span>
              </div>
            </div>
            <span class="status-pill ${
              complaint.status === "Completed"
                ? "status-completed"
                : complaint.status === "In Progress"
                  ? "status-progress"
                  : "status-pending"
            }">${complaint.status}</span>
          </div>
          <p>${complaint.description}</p>
          <div class="card-actions">
            <select data-status-select="${complaint.id}">
              ${complaintStatuses
                .map(
                  (status) =>
                    `<option value="${status}" ${status === complaint.status ? "selected" : ""}>${status}</option>`
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

  if (!state.checklist.length) {
    container.innerHTML = `<div class="empty-state">No checklist items added yet.</div>`;
    return;
  }

  container.innerHTML = state.checklist
    .map(
      (item) => `
        <article class="stack-item ${item.completed ? "completed" : ""}">
          <label class="check-row">
            <input type="checkbox" data-toggle-check="${item.id}" ${item.completed ? "checked" : ""}>
            <div>
              <strong>${item.title}</strong>
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
  const feedbackItems = state.complaints.filter((complaint) => complaint.feedback);

  if (!feedbackItems.length) {
    container.innerHTML = `<div class="empty-state">Feedback will appear here after residents respond.</div>`;
    return;
  }

  container.innerHTML = feedbackItems
    .map(
      (item) => `
        <article class="card-item">
          <div class="card-head">
            <div>
              <h4>${item.residentName}</h4>
              <div class="complaint-meta">
                <span>${item.category}</span>
                <span>Flat ${item.flatNumber}</span>
              </div>
            </div>
            <span class="status-pill status-completed">Completed</span>
          </div>
          <p class="feedback-note">${item.feedback}</p>
        </article>
      `
    )
    .join("");
}

function bindAdminEvents() {
  document.getElementById("admin-logout-button").addEventListener("click", logout);

  document.querySelectorAll("[data-update-status]").forEach((button) => {
    button.addEventListener("click", () => {
      const complaintId = button.dataset.updateStatus;
      const select = document.querySelector(`[data-status-select="${complaintId}"]`);
      const complaint = state.complaints.find((item) => item.id === complaintId);

      if (!complaint || !select) return;

      complaint.status = select.value;
      saveState();
      render();
    });
  });

  document.getElementById("checklist-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const title = String(new FormData(form).get("title")).trim();
    if (!title) return;

    state.checklist.unshift({
      id: uid("task"),
      title,
      completed: false
    });
    saveState();
    render();
  });

  document.querySelectorAll("[data-toggle-check]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const task = state.checklist.find((item) => item.id === checkbox.dataset.toggleCheck);
      if (!task) return;
      task.completed = checkbox.checked;
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-remove-task]").forEach((button) => {
    button.addEventListener("click", () => {
      state.checklist = state.checklist.filter((item) => item.id !== button.dataset.removeTask);
      saveState();
      render();
    });
  });
}

function logout() {
  state.currentUserId = null;
  saveState();
  render();
}

render();
