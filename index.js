import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

import dotenv from "dotenv";
import { createBareServer } from "@tomphttp/bare-server-node";
import cors from "cors";
import express from "express";
import basicAuth from "express-basic-auth";
import cookieParser from "cookie-parser";
import mime from "mime";
import bcrypt from "bcryptjs";
import { Pool } from "pg";

import config from "./config.js";
import { setupMasqr } from "./Masqr.js";

dotenv.config();

process.on("uncaughtException", (e) => {
  console.error("uncaughtException:", e);
  process.exit(1);
});
process.on("unhandledRejection", (e) => {
  console.error("unhandledRejection:", e);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

let pool;
try {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      device_id TEXT UNIQUE,
      recovery_code TEXT
    )`
  );
  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS device_id TEXT UNIQUE"
  );
  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_code TEXT"
  );
} catch (err) {
  console.error("Failed to initialize database", err);
  process.exit(1);
}

const SESSION_SECRET = process.env.SESSION_SECRET || "change-me";
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: false,
  path: "/",
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

function sign(val) {
  return crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(val)
    .digest("hex");
}

function setSession(res, username) {
  const value = Buffer.from(username, "utf8").toString("base64");
  const sig = sign(value);
  res.cookie("sid", `${value}.${sig}`, COOKIE_OPTIONS);
}

function clearSession(res) {
  res.cookie("sid", "", { ...COOKIE_OPTIONS, maxAge: 0 });
}

function getSession(req) {
  const raw = req.cookies?.sid;
  if (!raw) return null;
  const [val, sig] = raw.split(".");
  if (!val || !sig) return null;
  if (sign(val) !== sig) return null;
  const username = Buffer.from(val, "base64").toString("utf8");
  return { username };
}

const server = http.createServer();
const app = express();
const bareServer = createBareServer("/ov/");
const PORT = Number(process.env.PORT) || 8080;

const cache = new Map();
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

if (process.env.config === "true" && config?.challenge && config?.users) {
  console.log(
    `Password protection is enabled. Users: ${Object.keys(config.users).join(", ")}`
  );
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
    const contentType = binaryOnly.includes(ext)
      ? "application/octet-stream"
      : mime.getType(ext) || "application/octet-stream";

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
  const { username, password, deviceId } = req.body || {};
  if (!username || !password || !deviceId)
    return res.status(400).json({ error: "Missing fields" });
  if (password.length < 8)
    return res.status(400).json({ error: "Password too short" });
  try {
    const u = await pool.query("SELECT 1 FROM users WHERE username=$1", [
      username,
    ]);
    if (u.rows.length)
      return res.status(409).json({ error: "Username already exists" });
    const d = await pool.query("SELECT 1 FROM users WHERE device_id=$1", [
      deviceId,
    ]);
    if (d.rows.length)
      return res
        .status(429)
        .json({ error: "This device already has an account" });
    const hash = await bcrypt.hash(password, 10);
    const recovery = crypto.randomBytes(8).toString("hex");
    await pool.query(
      "INSERT INTO users (username, password, device_id, recovery_code) VALUES ($1,$2,$3,$4)",
      [username, hash, deviceId, recovery]
    );
    setSession(res, username);
    res.json({ success: true, recovery_code: recovery });
  } catch (err) {
    console.error("Signup DB error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: "Missing fields" });
  try {
    const { rows } = await pool.query(
      "SELECT password FROM users WHERE username=$1",
      [username]
    );
    if (!rows.length)
      return res.status(401).json({ error: "Invalid credentials" });
    const ok = await bcrypt.compare(password, rows[0].password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });
    setSession(res, username);
    res.json({ success: true });
  } catch (err) {
    console.error("Login DB error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/logout", (req, res) => {
  clearSession(res);
  res.json({ success: true });
});

app.post("/api/forgot/reset", async (req, res) => {
  const { username, recovery_code, new_password } = req.body || {};
  if (!username || !recovery_code || !new_password)
    return res.status(400).json({ error: "Missing fields" });
  if (new_password.length < 8)
    return res.status(400).json({ error: "Password too short" });
  try {
    const hash = await bcrypt.hash(new_password, 10);
    const result = await pool.query(
      "UPDATE users SET password=$1 WHERE username=$2 AND recovery_code=$3",
      [hash, username, recovery_code]
    );
    if (result.rowCount === 0)
      return res.status(400).json({ error: "Invalid recovery code" });
    res.json({ success: true });
  } catch (err) {
    console.error("Forgot reset DB error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/session", (req, res) => {
  const s = getSession(req);
  if (s) res.json({ authenticated: true, username: s.username });
  else res.json({ authenticated: false });
});

const requireAuthFile = (file) => (req, res) => {
  const s = getSession(req);
  if (!s) return res.sendFile(path.join(__dirname, "static", "lock.html"));
  res.sendFile(path.join(__dirname, "static", file));
};

app.get("/as", requireAuthFile("apps.html"));
app.get("/gm", requireAuthFile("games.html"));
app.get("/st", requireAuthFile("settings.html"));

[
  { path: "/ta", file: "tabs.html" },
  { path: "/ah", file: "about.html" },
  { path: "/li", file: "login.html" },
  { path: "/signup", file: "signup.html" },
  { path: "/su", file: "signup.html" },
  { path: "/forgot", file: "forgot.html" },
  { path: "/", file: "index.html" },
  { path: "/tos", file: "tos.html" },
].forEach((r) => {
  app.get(r.path, (_req, res) =>
    res.sendFile(path.join(__dirname, "static", r.file))
  );
});

app.use((req, res) =>
  res.status(404).sendFile(path.join(__dirname, "static", "404.html"))
);
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
