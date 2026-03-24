# Green Heritage CHS Portal

Full-stack complaint tracking and checklist portal for Green Heritage CHS, Kharghar.

## What Changed

- Real server-side authentication
- Password hashing with Node crypto
- SQLite-backed data storage
- Protected admin-only dashboard APIs
- Complaint, feedback, checklist, and report data stored on the server

## Demo Admin Login

- Email: `admin@greenheritage.in`
- Password: `admin123`

## Run Locally

```powershell
node server.js
```

Then open:

```text
http://localhost:3000
```

## Important Deployment Note

This version is no longer a GitHub Pages app.

GitHub Pages can only host static files and cannot run the backend authentication server. For public production use, this project needs a server host such as Render, Railway, VPS hosting, or another Node-compatible platform.

## Render Deployment

This repo now includes `render.yaml` for Render deployment with a persistent disk mounted at `/opt/render/project/src/data`.

After connecting the GitHub repo to Render, deploy it as a web service and use:

- Start command: `node server.js`
- Port: Render will provide `PORT` automatically
- Persistent disk: required for SQLite data
