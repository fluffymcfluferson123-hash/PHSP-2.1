import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

import { createBareServer } from "@tomphttp/bare-server-node";
import cors from "cors";
import express from "express";
import basicAuth from "express-basic-auth";
import cookieParser from "cookie-parser";
import mime from "mime";

import config from "./config.js";
import { setupMasqr } from "./Masqr.js";

process.on("uncaughtException", (e) => { console.error("uncaughtException:", e); process.exit(1); });
process.on("unhandledRejection", (e) => { console.error("unhandledRejection:", e); });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let pool = null;
const memoryUsers = new Map();

if (process.env.DATABASE_URL) {
  try {
    const pkg = await import("pg");
    const { Pool } = pkg;
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    pool.query(
      "CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL)"
    ).catch((err) => console.error("Failed to ensure users table", err));
  } catch (err) {
    console.error("Failed to load/initialize pg module", err);
  }
} else {
  console.warn("DATABASE_URL not set; using in-memory user store");
}

const server = http.createServer();
const app = express();
const bareServer = createBareServer("/ov/");
const PORT = Number(process.env.PORT) || 8080;

const cache = new Map();
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

if (process.env.config === "true" && config?.challenge && config?.users) {
  console.log(`Password protection is enabled. Users: ${Object.keys(config.users).join(", ")}`);
  app.use(basicAuth({ users: config.users, challenge: true }));
}

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/ov", cors({ origin: true }));

if (process.env.MASQR === "true") {
  setupMasqr(app);
}

app.get("/e/*", async (req, res, next) => {
  const cached = cache.get(req.path);
  if (cached && Date.now() - cached.timestamp <= CACHE_TTL) {
    res.writeHead(200, { "Content-Type": cached.contentType });
    return res.end(cached.data);
  }
  if (cached) cache.delete(req.path);

  try {
    const baseUrls = {
      "/e/1/": "https://raw.githubusercontent.com/v-5x/x/fixy/",
      "/e/2/": "https://raw.githubusercontent.com/ypxa/y/main/",
      "/e/3/": "https://raw.githubusercontent.com/ypxa/w/master/",
    };

    let reqTarget = null;
    for (const [prefix, baseUrl] of Object.entries(baseUrls)) {
      if (req.path.startsWith(prefix)) {
        reqTarget = baseUrl + req.path.slice(prefix.length);
        break;
      }
    }
    if (!reqTarget) return next();

    const asset = await fetch(reqTarget);
    if (!asset.ok) return next();

    const buf = Buffer.from(await asset.arrayBuffer());
    const ext = path.extname(reqTarget);
    const binaryOnly = [".unityweb"];
    const contentType = binaryOnly.includes(ext) ? "application/octet-stream" : (mime.getType(ext) || "application/octet-stream");

    cache.set(req.path, { data: buf, contentType, timestamp: Date.now() });
    res.writeHead(200, { "Content-Type": contentType });
    res.end(buf);
  } catch (error) {
    console.error("Asset proxy error:", error);
    res.status(500).send("Error fetching the asset");
  }
});

app.use(express.static(path.join(__dirname, "static")));
app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.post("/api/signup", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Missing fields" });
  const hash = crypto.createHash("sha256").update(password).digest("hex");

  if (!pool) {
    if (memoryUsers.has(username)) return res.status(409).json({ error: "User already exists" });
    memoryUsers.set(username, hash);
    return res.json({ success: true, mode: "memory" });
  }
  try {
    await pool.query("INSERT INTO users (username, password) VALUES ($1,$2)", [username, hash]);
    res.json({ success: true, mode: "db" });
  } catch (err) {
    if (err?.code === "23505") return res.status(409).json({ error: "User already exists" });
    console.error("Signup DB error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Missing fields" });
  const hash = crypto.createHash("sha256").update(password).digest("hex");

  if (!pool) {
    const stored = memoryUsers.get(username);
    if (stored && stored === hash) return res.json({ success: true, mode: "memory" });
    return res.status(401).json({ error: "Invalid credentials" });
  }
  try {
    const { rows } = await pool.query("SELECT password FROM users WHERE username=$1", [username]);
    if (rows.length && rows[0].password === hash) return res.json({ success: true, mode: "db" });
    return res.status(401).json({ error: "Invalid credentials" });
  } catch (err) {
    console.error("Login DB error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

[
  { path: "/as", file: "apps.html" },
  { path: "/gm", file: "games.html" },
  { path: "/st", file: "settings.html" },
  { path: "/ta", file: "tabs.html" },
  { path: "/ah", file: "about.html" },
  { path: "/li", file: "login.html" },
  { path: "/",  file: "index.html" },
  { path: "/tos", file: "tos.html" },
].forEach((r) => {
  app.get(r.path, (_req, res) => res.sendFile(path.join(__dirname, "static", r.file)));
});

app.use((req, res) => res.status(404).sendFile(path.join(__dirname, "static", "404.html")));
app.use((err, req, res, _next) => {
  console.error("Express error:", err?.stack || err);
  res.status(500).sendFile(path.join(__dirname, "static", "404.html"));
});

server.on("request", (req, res) => {
  if (bareServer.shouldRoute(req)) bareServer.routeRequest(req, res);
  else app(req, res);
});
server.on("upgrade", (req, socket, head) => {
  if (bareServer.shouldRoute(req)) bareServer.routeUpgrade(req, socket, head);
  else socket.end();
});

server.on("listening", () => {
  const addr = server.address();
  const host = addr && (addr.address === "0.0.0.0" ? "localhost" : addr.address);
  console.log(`Running at http://${host}:${addr?.port ?? PORT}`);
});
server.on("error", (err) => console.error("Server error:", err));

server.listen(PORT, "0.0.0.0");