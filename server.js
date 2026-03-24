const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");
const { DatabaseSync } = require("node:sqlite");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "app.db");

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);

const complaintCategories = [
  "Housekeeping",
  "Plumbing",
  "Electrical",
  "Club House",
  "Civil Work",
  "Account",
  "Internal Leakage",
  "Other"
];

const complaintStatuses = ["Pending", "In Progress", "Completed"];

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

setupDatabase();
seedDatabase();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Internal server error." });
  }
});

server.listen(PORT, () => {
  console.log(`Green Heritage CHS server running on http://localhost:${PORT}`);
});

function setupDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      flat_number TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('resident', 'admin')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      resident_name TEXT NOT NULL,
      flat_number TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      feedback TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS checklist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS checklist_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      completed_at TEXT DEFAULT '',
      removed_at TEXT NOT NULL
    );
  `);
}

function seedDatabase() {
  const userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (userCount > 0) {
    return;
  }

  const now = new Date().toISOString();
  const adminHash = hashPassword("admin123");

  const adminResult = db
    .prepare(`
      INSERT INTO users (name, flat_number, email, password_hash, role, created_at)
      VALUES (?, ?, ?, ?, 'admin', ?)
    `)
    .run("Society Admin", "Office", "admin@greenheritage.in", adminHash, now);

  db.prepare(`
    INSERT INTO complaints (user_id, resident_name, flat_number, category, description, status, feedback, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, '', ?, ?)
  `).run(
    adminResult.lastInsertRowid,
    "Sample Resident",
    "B-204",
    "Housekeeping",
    "Lobby cleaning needed near the lift area.",
    "Pending",
    "2026-03-21T08:30:00.000Z",
    "2026-03-21T08:30:00.000Z"
  );

  const insertChecklist = db.prepare(`
    INSERT INTO checklist_items (title, completed, completed_at, created_at)
    VALUES (?, ?, ?, ?)
  `);

  insertChecklist.run("Check water tank motor operation", 1, "2026-03-21T07:30:00.000Z", now);
  insertChecklist.run("Inspect lift lobby cleanliness", 0, "", now);
  insertChecklist.run("Verify clubhouse lighting", 0, "", now);
}

async function handleApi(req, res, url) {
  const currentUser = getSessionUser(req);

  if (req.method === "GET" && url.pathname === "/api/session") {
    if (!currentUser) {
      sendJson(res, 200, { user: null, complaintCategories, complaintStatuses });
      return;
    }

    sendJson(res, 200, {
      user: sanitizeUser(currentUser),
      complaintCategories,
      complaintStatuses
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/signup") {
    const body = await readJson(req);
    const name = String(body.name || "").trim();
    const flatNumber = String(body.flatNumber || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!name || !flatNumber || !email || password.length < 4) {
      sendJson(res, 400, { error: "All signup fields are required." });
      return;
    }

    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
      sendJson(res, 409, { error: "An account with this email already exists." });
      return;
    }

    const now = new Date().toISOString();
    const result = db
      .prepare(`
        INSERT INTO users (name, flat_number, email, password_hash, role, created_at)
        VALUES (?, ?, ?, ?, 'resident', ?)
      `)
      .run(name, flatNumber, email, hashPassword(password), now);

    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
    createSession(res, user.id);
    sendJson(res, 201, { user: sanitizeUser(user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJson(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

    if (!user || !verifyPassword(password, user.password_hash)) {
      sendJson(res, 401, { error: "Invalid email or password." });
      return;
    }

    createSession(res, user.id);
    sendJson(res, 200, { user: sanitizeUser(user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    if (currentUser) {
      const token = getCookie(req, "ghchs_session");
      if (token) {
        db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
      }
    }

    clearSession(res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (!currentUser) {
    sendJson(res, 401, { error: "Authentication required." });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/dashboard") {
    sendJson(res, 200, buildDashboardPayload(currentUser));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/complaints") {
    const body = await readJson(req);
    const flatNumber = String(body.flatNumber || "").trim();
    const category = String(body.category || "").trim();
    const description = String(body.description || "").trim();

    if (!flatNumber || !description || !complaintCategories.includes(category)) {
      sendJson(res, 400, { error: "Please complete all complaint fields." });
      return;
    }

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO complaints (user_id, resident_name, flat_number, category, description, status, feedback, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'Pending', '', ?, ?)
    `).run(currentUser.id, currentUser.name, flatNumber, category, description, now, now);

    sendJson(res, 201, buildDashboardPayload(currentUser));
    return;
  }

  if (req.method === "POST" && /^\/api\/complaints\/\d+\/feedback$/.test(url.pathname)) {
    const complaintId = Number(url.pathname.split("/")[3]);
    const body = await readJson(req);
    const feedback = String(body.feedback || "").trim();
    const complaint = db.prepare("SELECT * FROM complaints WHERE id = ?").get(complaintId);

    if (!complaint || complaint.user_id !== currentUser.id || complaint.status !== "Completed") {
      sendJson(res, 403, { error: "Feedback cannot be submitted for this complaint." });
      return;
    }

    db.prepare("UPDATE complaints SET feedback = ?, updated_at = ? WHERE id = ?").run(
      feedback,
      new Date().toISOString(),
      complaintId
    );

    sendJson(res, 200, buildDashboardPayload(currentUser));
    return;
  }

  if (currentUser.role !== "admin") {
    sendJson(res, 403, { error: "Admin access required." });
    return;
  }

  if (req.method === "PATCH" && /^\/api\/complaints\/\d+\/status$/.test(url.pathname)) {
    const complaintId = Number(url.pathname.split("/")[3]);
    const body = await readJson(req);
    const status = String(body.status || "");
    if (!complaintStatuses.includes(status)) {
      sendJson(res, 400, { error: "Invalid complaint status." });
      return;
    }

    db.prepare("UPDATE complaints SET status = ?, updated_at = ? WHERE id = ?").run(
      status,
      new Date().toISOString(),
      complaintId
    );

    sendJson(res, 200, buildDashboardPayload(currentUser));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/checklist") {
    const body = await readJson(req);
    const title = String(body.title || "").trim();
    if (!title) {
      sendJson(res, 400, { error: "Checklist title is required." });
      return;
    }

    db.prepare(`
      INSERT INTO checklist_items (title, completed, completed_at, created_at)
      VALUES (?, 0, '', ?)
    `).run(title, new Date().toISOString());

    sendJson(res, 201, buildDashboardPayload(currentUser));
    return;
  }

  if (req.method === "PATCH" && /^\/api\/checklist\/\d+$/.test(url.pathname)) {
    const itemId = Number(url.pathname.split("/")[3]);
    const body = await readJson(req);
    const completed = Boolean(body.completed);

    db.prepare(`
      UPDATE checklist_items
      SET completed = ?, completed_at = ?
      WHERE id = ?
    `).run(completed ? 1 : 0, completed ? new Date().toISOString() : "", itemId);

    sendJson(res, 200, buildDashboardPayload(currentUser));
    return;
  }

  if (req.method === "DELETE" && /^\/api\/checklist\/\d+$/.test(url.pathname)) {
    const itemId = Number(url.pathname.split("/")[3]);
    const item = db.prepare("SELECT * FROM checklist_items WHERE id = ?").get(itemId);
    if (!item) {
      sendJson(res, 404, { error: "Checklist item not found." });
      return;
    }

    if (item.completed) {
      db.prepare(`
        INSERT INTO checklist_history (title, completed_at, removed_at)
        VALUES (?, ?, ?)
      `).run(item.title, item.completed_at || new Date().toISOString(), new Date().toISOString());
    }

    db.prepare("DELETE FROM checklist_items WHERE id = ?").run(itemId);
    sendJson(res, 200, buildDashboardPayload(currentUser));
    return;
  }

  sendJson(res, 404, { error: "Not found." });
}

function buildDashboardPayload(user) {
  const complaints = user.role === "admin"
    ? db.prepare("SELECT * FROM complaints ORDER BY datetime(created_at) DESC").all()
    : db.prepare("SELECT * FROM complaints WHERE user_id = ? ORDER BY datetime(created_at) DESC").all(user.id);

  const checklist = db.prepare("SELECT * FROM checklist_items ORDER BY id DESC").all();

  const payload = {
    user: sanitizeUser(user),
    complaintCategories,
    complaintStatuses,
    checklist: checklist.map(normalizeChecklist),
    complaints: complaints.map(normalizeComplaint)
  };

  if (user.role === "admin") {
    const allComplaints = db.prepare("SELECT status, category, feedback FROM complaints").all();
    const metrics = {
      total: allComplaints.length,
      pending: allComplaints.filter((item) => item.status === "Pending").length,
      inProgress: allComplaints.filter((item) => item.status === "In Progress").length,
      completed: allComplaints.filter((item) => item.status === "Completed").length
    };

    const feedback = db
      .prepare("SELECT resident_name, flat_number, category, feedback FROM complaints WHERE feedback != '' ORDER BY datetime(updated_at) DESC")
      .all();

    const checklistHistory = db
      .prepare("SELECT * FROM checklist_history ORDER BY datetime(removed_at) DESC")
      .all()
      .map((item) => ({
        id: item.id,
        title: item.title,
        completedAt: item.completed_at,
        source: "Archived After Removal"
      }));

    const activeCompletedChecklist = checklist
      .filter((item) => item.completed)
      .map((item) => ({
        id: item.id,
        title: item.title,
        completedAt: item.completed_at,
        source: "Active Checklist"
      }));

    const categorySummary = complaintCategories.map((category) => ({
      category,
      count: allComplaints.filter((item) => item.category === category).length
    }));

    payload.admin = {
      metrics,
      feedback,
      reports: {
        categorySummary,
        checklistHistory: [...activeCompletedChecklist, ...checklistHistory]
      }
    };
  }

  return payload;
}

function normalizeComplaint(complaint) {
  return {
    id: complaint.id,
    userId: complaint.user_id,
    residentName: complaint.resident_name,
    flatNumber: complaint.flat_number,
    category: complaint.category,
    description: complaint.description,
    status: complaint.status,
    feedback: complaint.feedback,
    createdAt: complaint.created_at,
    updatedAt: complaint.updated_at
  };
}

function normalizeChecklist(item) {
  return {
    id: item.id,
    title: item.title,
    completed: Boolean(item.completed),
    completedAt: item.completed_at
  };
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    flatNumber: user.flat_number,
    email: user.email,
    role: user.role
  };
}

function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7).toISOString();

  db.prepare(`
    INSERT INTO sessions (user_id, token, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(userId, token, expiresAt, now.toISOString());

  const cookie = [
    `ghchs_session=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${60 * 60 * 24 * 7}`
  ].join("; ");

  res.setHeader("Set-Cookie", cookie);
}

function clearSession(res) {
  res.setHeader("Set-Cookie", "ghchs_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}

function getSessionUser(req) {
  const token = getCookie(req, "ghchs_session");
  if (!token) return null;

  const session = db.prepare(`
    SELECT sessions.token, sessions.expires_at, users.*
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ?
  `).get(token);

  if (!session) {
    return null;
  }

  if (new Date(session.expires_at) < new Date()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }

  return session;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password, hash) {
  const [salt, expected] = String(hash).split(":");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(derived, "hex"));
}

function getCookie(req, key) {
  const cookieHeader = req.headers.cookie || "";
  const cookies = cookieHeader.split(";").map((part) => part.trim());
  const match = cookies.find((item) => item.startsWith(`${key}=`));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : "";
}

function serveStatic(req, res, url) {
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const allowedFiles = new Set(["/index.html", "/styles.css", "/script.js"]);
  if (!allowedFiles.has(pathname)) {
    sendText(res, 404, "Not found");
    return;
  }

  const requestedPath = path.normalize(path.join(PUBLIC_DIR, pathname));

  if (!requestedPath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  if (!fs.existsSync(requestedPath) || fs.statSync(requestedPath).isDirectory()) {
    sendText(res, 404, "Not found");
    return;
  }

  const extension = path.extname(requestedPath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": contentTypes[extension] || "application/octet-stream",
    "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=3600"
  });
  fs.createReadStream(requestedPath).pipe(res);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(text)
  });
  res.end(text);
}
