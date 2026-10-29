#!/usr/bin/env node
/**
 * Invenio Homes — site + Studio server.
 *
 *   node server.mjs            # http://127.0.0.1:4173
 *   STUDIO_PASSWORD=... HOST=0.0.0.0 node server.mjs
 *
 * Serves the built site from dist/, the Studio from studio/, and a small
 * JSON API that writes content/ and rebuilds the site. No dependencies.
 */

import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, "dist");
const ASSETS = path.join(ROOT, "assets");
const CONTENT = path.join(ROOT, "content");
const STUDIO = path.join(ROOT, "studio");
const STATE_DIR = path.join(ROOT, ".studio");
const BACKUP_DIR = path.join(STATE_DIR, "backups");
const UPLOAD_TMP = path.join(STATE_DIR, "uploads");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const PASSWORD = process.env.STUDIO_PASSWORD || "";
const LOOPBACK = HOST === "127.0.0.1" || HOST === "localhost" || HOST === "::1";
const SECURE_COOKIE = process.env.SECURE_COOKIE === "1";
const SESSION_HOURS = 12;
const MAX_JSON = 3 * 1024 * 1024;
const MAX_UPLOAD = 14 * 1024 * 1024;

if (!PASSWORD && !LOOPBACK) {
  console.error(
    "Refusing to expose the Studio without a password.\n" +
      "Set STUDIO_PASSWORD and start again, e.g.\n" +
      "  STUDIO_PASSWORD='your-strong-password' HOST=0.0.0.0 node server.mjs"
  );
  process.exit(1);
}

fs.mkdirSync(STATE_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_TMP, { recursive: true });

function getSecret() {
  const env = process.env.SESSION_SECRET;
  if (env) return env;
  const file = path.join(STATE_DIR, "secret");
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    const secret = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}
const SECRET = getSecret();

const DOC_FILES = new Set([
  "settings.json",
  "home.json",
  "villas.json",
  "destinations.json",
  "testimonials.json",
  "team.json",
  "pages/owners.json",
  "pages/platform.json",
  "pages/about.json",
  "pages/contact.json",
  "pages/collection.json",
  "pages/destinations.json",
  "pages/legal.json",
]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function json(res, status, data, extra = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "X-Content-Type-Options": "nosniff",
    ...extra,
  });
  res.end(body);
}

function fail(res, status, message) {
  json(res, status, { ok: false, error: message });
}

function safeJoin(base, rel) {
  const target = path.resolve(base, "." + path.sep + rel.replace(/^\/+/, ""));
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  return target;
}

function sendFile(res, file, { head = false, cache = "no-cache", status = 200 } = {}) {
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
    res.writeHead(status, {
      "Content-Type": type,
      "Content-Length": stat.size,
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
    });
    if (head) {
      res.end();
      return;
    }
    fs.createReadStream(file).on("error", () => res.destroy()).pipe(res);
  });
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("too-large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("bad-json"));
      }
    });
    req.on("error", reject);
  });
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie || "";
  header.split(";").forEach((part) => {
    const index = part.indexOf("=");
    if (index === -1) return;
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  });
  return out;
}

function signSession(expires) {
  const mac = crypto.createHmac("sha256", SECRET).update(String(expires)).digest("base64url");
  return `${expires}.${mac}`;
}

function verifySession(token) {
  if (!token || typeof token !== "string") return false;
  const dot = token.lastIndexOf(".");
  if (dot === -1) return false;
  const expires = Number(token.slice(0, dot));
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  const expected = signSession(expires);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isAuthed(req) {
  if (!PASSWORD) return true;
  return verifySession(parseCookies(req).invenio_studio);
}

function cookieHeader(value, maxAge) {
  const bits = [
    `invenio_studio=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
  ];
  if (SECURE_COOKIE) bits.push("Secure");
  return bits.join("; ");
}

function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const o = new URL(origin);
    const host = req.headers.host || "";
    return o.host === host;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Auth rate limiting                                                          */
/* -------------------------------------------------------------------------- */

const attempts = new Map();
function limited(ip) {
  const now = Date.now();
  const item = attempts.get(ip) || { count: 0, first: now };
  if (now - item.first > 60_000) {
    item.count = 0;
    item.first = now;
  }
  item.count += 1;
  attempts.set(ip, item);
  return item.count > 8;
}

/* -------------------------------------------------------------------------- */
/* Content                                                                     */
/* -------------------------------------------------------------------------- */

async function readContent() {
  const docs = {};
  const names = {
    settings: "settings.json",
    home: "home.json",
    villas: "villas.json",
    destinations: "destinations.json",
    testimonials: "testimonials.json",
    team: "team.json",
    owners: "pages/owners.json",
    platform: "pages/platform.json",
    about: "pages/about.json",
    contact: "pages/contact.json",
    collection: "pages/collection.json",
    destinationsPage: "pages/destinations.json",
    legal: "pages/legal.json",
  };
  for (const [key, rel] of Object.entries(names)) {
    const raw = await fsp.readFile(path.join(CONTENT, rel), "utf8");
    docs[key] = JSON.parse(raw);
  }
  return docs;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function backup(rel) {
  const from = path.join(CONTENT, rel);
  const to = path.join(BACKUP_DIR, stamp() + "__" + rel.replaceAll("/", "__"));
  try {
    await fsp.copyFile(from, to);
  } catch {
    /* first save of a new file */
  }
}

function runBuild() {
  return new Promise((resolve) => {
    execFile(
      "python3",
      ["build.py"],
      { cwd: ROOT, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          code: error ? error.code ?? 1 : 0,
          stdout: String(stdout || "").trim(),
          stderr: String(stderr || "").trim(),
        });
      }
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Media                                                                       */
/* -------------------------------------------------------------------------- */

const IMAGE_RE = /^(.+)-(480|960|1600|2400)\.jpg$/i;

async function listMedia() {
  const items = new Map();
  const dirs = [
    { dir: path.join(ASSETS, "img"), prefix: "" },
    { dir: path.join(ASSETS, "img", "uploads"), prefix: "uploads/" },
  ];
  for (const { dir, prefix } of dirs) {
    let files = [];
    try {
      files = await fsp.readdir(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      const match = IMAGE_RE.exec(file);
      if (!match) continue;
      const name = prefix + match[1];
      const width = Number(match[2]);
      const existing = items.get(name) || { name, sizes: [] };
      existing.sizes.push(width);
      items.set(name, existing);
    }
  }
  return Array.from(items.values())
    .map((item) => {
      const widths = item.sizes.sort((a, b) => a - b);
      const thumb = widths.find((w) => w >= 480) || widths[0];
      return {
        name: item.name,
        url: `/assets/img/${item.name}-${thumb}.jpg`,
        large: `/assets/img/${item.name}-${widths[widths.length - 1]}.jpg`,
        uploaded: item.name.startsWith("uploads/"),
      };
    })
    .sort((a, b) => {
      if (a.uploaded !== b.uploaded) return a.uploaded ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

function magic(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "jpg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "png";
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  )
    return "webp";
  return null;
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/* -------------------------------------------------------------------------- */
/* API                                                                         */
/* -------------------------------------------------------------------------- */

async function api(req, res, url) {
  const route = url.pathname.replace(/^\/studio\/api\//, "");
  const ip = req.socket.remoteAddress || "unknown";

  if (route === "session" && req.method === "GET") {
    return json(res, 200, {
      authenticated: isAuthed(req),
      required: Boolean(PASSWORD),
      builds: await buildStatus(),
    });
  }

  if (route === "login" && req.method === "POST") {
    if (!PASSWORD) return json(res, 200, { ok: true });
    if (limited(ip)) return fail(res, 429, "Too many attempts. Wait a minute and try again.");
    if (!checkOrigin(req)) return fail(res, 403, "Bad origin.");
    let body;
    try {
      body = await readBody(req, 16 * 1024);
    } catch {
      return fail(res, 400, "Could not read the request.");
    }
    const given = Buffer.from(String(body.password || ""));
    const expected = Buffer.from(PASSWORD);
    const ok = given.length === expected.length && crypto.timingSafeEqual(given, expected);
    if (!ok) return fail(res, 401, "That password is not right.");
    const expires = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
    const cookie = cookieHeader(signSession(expires), SESSION_HOURS * 60 * 60);
    return json(res, 200, { ok: true }, { "Set-Cookie": cookie });
  }

  if (route === "logout" && req.method === "POST") {
    return json(res, 200, { ok: true }, { "Set-Cookie": cookieHeader("", 0) });
  }

  if (!isAuthed(req)) return fail(res, 401, "Please sign in.");

  if (route === "content" && req.method === "GET") {
    return json(res, 200, { ok: true, docs: await readContent(), media: await listMedia() });
  }

  if (route === "media" && req.method === "GET") {
    return json(res, 200, { ok: true, items: await listMedia() });
  }

  if (route === "save" && req.method === "POST") {
    if (!checkOrigin(req)) return fail(res, 403, "Bad origin.");
    let body;
    try {
      body = await readBody(req, MAX_JSON);
    } catch (err) {
      return fail(res, err.message === "too-large" ? 413 : 400, "Could not read the request.");
    }
    const file = String(body.file || "").replaceAll("\\", "/");
    if (!DOC_FILES.has(file)) return fail(res, 400, "That file is not editable.");
    if (!body.data || typeof body.data !== "object") return fail(res, 400, "No content was sent.");
    const serialized = JSON.stringify(body.data, null, 2) + "\n";
    if (Buffer.byteLength(serialized) > MAX_JSON) return fail(res, 413, "That content is too large.");
    const target = path.join(CONTENT, file);
    await backup(file);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    const tmp = target + ".tmp-" + crypto.randomBytes(4).toString("hex");
    await fsp.writeFile(tmp, serialized, "utf8");
    await fsp.rename(tmp, target);
    const build = await runBuild();
    return json(res, build.ok ? 200 : 500, {
      ok: build.ok,
      build,
      savedAt: new Date().toISOString(),
    });
  }

  if (route === "build" && req.method === "POST") {
    if (!checkOrigin(req)) return fail(res, 403, "Bad origin.");
    const build = await runBuild();
    return json(res, build.ok ? 200 : 500, { ok: build.ok, build });
  }

  if (route === "upload" && req.method === "POST") {
    if (!checkOrigin(req)) return fail(res, 403, "Bad origin.");
    let body;
    try {
      body = await readBody(req, MAX_UPLOAD + 2 * 1024 * 1024);
    } catch (err) {
      return fail(res, err.message === "too-large" ? 413 : 400, "Could not read the upload.");
    }
    const raw = String(body.data || "");
    const base64 = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
    let buffer;
    try {
      buffer = Buffer.from(base64, "base64");
    } catch {
      return fail(res, 400, "That file could not be read.");
    }
    if (!buffer.length) return fail(res, 400, "The file is empty.");
    if (buffer.length > MAX_UPLOAD) return fail(res, 413, "Images must be under 14 MB.");
    const kind = magic(buffer);
    if (!kind) return fail(res, 400, "Please upload a JPEG, PNG or WebP image.");
    const base = slugify(body.name ? body.name.replace(/\.[^.]+$/, "") : "image") || "image";
    const unique = `${base}-${crypto.randomBytes(2).toString("hex")}`;
    const tmp = path.join(UPLOAD_TMP, unique + "." + kind);
    await fsp.writeFile(tmp, buffer);
    const prepared = await new Promise((resolve) => {
      execFile(
        "python3",
        ["tools/prepare_image.py", tmp, `uploads/${unique}`],
        { cwd: ROOT, timeout: 60_000, maxBuffer: 2 * 1024 * 1024 },
        (error, stdout, stderr) =>
          resolve({ ok: !error, stdout: String(stdout || "").trim(), stderr: String(stderr || "").trim() })
      );
    });
    await fsp.unlink(tmp).catch(() => {});
    if (!prepared.ok) {
      return fail(res, 500, "The image could not be prepared. Is Pillow installed? " + prepared.stderr);
    }
    return json(res, 200, { ok: true, name: `uploads/${unique}`, media: await listMedia() });
  }

  if (route === "media" && req.method === "DELETE") {
    if (!checkOrigin(req)) return fail(res, 403, "Bad origin.");
    let body;
    try {
      body = await readBody(req, 16 * 1024);
    } catch {
      return fail(res, 400, "Could not read the request.");
    }
    const name = String(body.name || "");
    if (!name.startsWith("uploads/")) return fail(res, 400, "Only uploaded images can be removed.");
    const safe = slugify(name.replace("uploads/", ""));
    if (!safe) return fail(res, 400, "Invalid image.");
    for (const size of [480, 960, 1600, 2400]) {
      await fsp
        .unlink(path.join(ASSETS, "img", "uploads", `${safe}-${size}.jpg`))
        .catch(() => {});
    }
    await runBuild();
    return json(res, 200, { ok: true, media: await listMedia() });
  }

  return fail(res, 404, "Unknown API route.");
}

/* -------------------------------------------------------------------------- */
/* Build status                                                                */
/* -------------------------------------------------------------------------- */

let lastBuild = null;
let building = null;

async function buildStatus() {
  if (building) return { state: "building", last: lastBuild };
  try {
    const stat = await fsp.stat(path.join(DIST, "index.html"));
    return { state: "ready", last: lastBuild, builtAt: stat.mtime.toISOString() };
  } catch {
    return { state: "empty", last: lastBuild };
  }
}

/* -------------------------------------------------------------------------- */
/* Static site                                                                 */
/* -------------------------------------------------------------------------- */

function siteFile(pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/") rel = "/index.html";
  if (rel.endsWith("/")) rel += "index.html";
  const file = safeJoin(DIST, rel);
  if (file && fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  const html = safeJoin(DIST, rel + "/index.html");
  if (html && fs.existsSync(html) && fs.statSync(html).isFile()) return html;
  return null;
}

function studioFile(pathname) {
  let rel = pathname.replace(/^\/studio\/?/, "");
  if (!rel) rel = "index.html";
  return safeJoin(STUDIO, rel);
}

async function handler(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (pathname.startsWith("/studio/api/")) {
    try {
      return await api(req, res, url);
    } catch (error) {
      console.error("API error", error);
      return fail(res, 500, "The Studio hit an unexpected error.");
    }
  }

  if (pathname === "/studio" || pathname === "/studio/") {
    return sendFile(res, path.join(STUDIO, "index.html"), { head: req.method === "HEAD" });
  }
  if (pathname.startsWith("/studio/")) {
    const file = studioFile(pathname);
    if (!file) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    return sendFile(res, file, { head: req.method === "HEAD", cache: "no-cache" });
  }

  if (pathname === "/favicon.svg") {
    return sendFile(res, path.join(DIST, "favicon.svg"), { head: req.method === "HEAD", cache: "public, max-age=3600" });
  }

  if (pathname.startsWith("/assets/")) {
    if (pathname.includes("/img/source/")) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const file = safeJoin(ASSETS, pathname.replace(/^\/assets/, ""));
    if (!file) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    return sendFile(res, file, {
      head: req.method === "HEAD",
      cache: "public, max-age=3600",
    });
  }

  const file = siteFile(pathname);
  if (file) {
    return sendFile(res, file, { head: req.method === "HEAD", cache: "no-cache" });
  }

  const notFound = path.join(DIST, "404.html");
  if (fs.existsSync(notFound)) {
    return sendFile(res, notFound, { head: req.method === "HEAD", status: 404 });
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

/* -------------------------------------------------------------------------- */
/* Boot                                                                        */
/* -------------------------------------------------------------------------- */

const server = http.createServer((req, res) => {
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  handler(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end("Server error");
  });
});

async function boot() {
  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    console.log("Building the site for the first time…");
    building = runBuild();
    const result = await building;
    building = null;
    lastBuild = result;
    if (!result.ok) {
      console.error("Build failed:", result.stderr || result.stdout);
    } else {
      console.log("Built:", result.stdout);
    }
  }
  server.listen(PORT, HOST, () => {
    console.log(`\n  Invenio Homes`);
    console.log(`  Site     http://${HOST}:${PORT}/`);
    console.log(`  Studio   http://${HOST}:${PORT}/studio/`);
    if (!PASSWORD) console.log("  Studio is open (loopback only — set STUDIO_PASSWORD before exposing it).");
    console.log("");
  });
}

boot();
