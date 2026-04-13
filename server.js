const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Directories ──
const DATA_DIR = path.join(__dirname, "data");
const COMPLIANCE_DIR = path.join(__dirname, "compliance");
const UPLOADS_DIR = path.join(__dirname, "assets", "uploads");

[DATA_DIR, COMPLIANCE_DIR, path.join(COMPLIANCE_DIR, "screenshots"), path.join(COMPLIANCE_DIR, "approvals"), UPLOADS_DIR].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ── Middleware ──
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve static files (the existing site)
app.use(express.static(__dirname, { extensions: ["html"] }));

// ── File helpers ──
function readJSON(file) {
  const fp = path.join(DATA_DIR, file);
  if (!fs.existsSync(fp)) return null;
  return JSON.parse(fs.readFileSync(fp, "utf-8"));
}

function writeJSON(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

// ── Multer storage for image uploads ──
const imgStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dest = req.query.dir === "team" ? path.join(__dirname, "assets", "team") : UPLOADS_DIR;
    cb(null, dest);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = file.originalname.replace(ext, "").replace(/[^a-z0-9-_]/gi, "-").toLowerCase();
    cb(null, name + "-" + Date.now() + ext);
  },
});
const upload = multer({
  storage: imgStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

// Compliance approval uploads (PDF, images)
const approvalStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(COMPLIANCE_DIR, "approvals")),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, "approval-" + Date.now() + ext);
  },
});
const approvalUpload = multer({
  storage: approvalStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

// ══════════════════════════════════════════════
//  API — ARTICLES
// ══════════════════════════════════════════════
app.get("/api/articles", (_req, res) => {
  res.json(readJSON("articles.json") || []);
});

app.post("/api/articles", (req, res) => {
  const articles = readJSON("articles.json") || [];
  const article = {
    id: String(Date.now()),
    title: req.body.title || "",
    date: req.body.date || new Date().toISOString().slice(0, 10),
    category: req.body.category || "commentary",
    summary: req.body.summary || "",
    image: req.body.image || "",
    link: req.body.link || "",
    author: req.body.author || "",
  };
  articles.push(article);
  writeJSON("articles.json", articles);
  logCompliance("article_created", { id: article.id, title: article.title });
  res.json(article);
});

app.put("/api/articles/:id", (req, res) => {
  const articles = readJSON("articles.json") || [];
  const idx = articles.findIndex((a) => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  articles[idx] = { ...articles[idx], ...req.body, id: req.params.id };
  writeJSON("articles.json", articles);
  logCompliance("article_updated", { id: req.params.id, title: articles[idx].title });
  res.json(articles[idx]);
});

app.delete("/api/articles/:id", (req, res) => {
  let articles = readJSON("articles.json") || [];
  const article = articles.find((a) => a.id === req.params.id);
  articles = articles.filter((a) => a.id !== req.params.id);
  writeJSON("articles.json", articles);
  logCompliance("article_deleted", { id: req.params.id, title: article ? article.title : "" });
  res.json({ ok: true });
});

// ══════════════════════════════════════════════
//  API — TEAM
// ══════════════════════════════════════════════
app.get("/api/team", (_req, res) => {
  res.json(readJSON("team.json") || []);
});

app.put("/api/team", (req, res) => {
  writeJSON("team.json", req.body);
  logCompliance("team_updated", { count: req.body.length });
  res.json({ ok: true });
});

// ══════════════════════════════════════════════
//  API — SITE CONTENT (page text)
// ══════════════════════════════════════════════
app.get("/api/content", (_req, res) => {
  res.json(readJSON("content.json") || {});
});

app.put("/api/content", (req, res) => {
  const prev = readJSON("content.json") || {};
  const next = { ...prev, ...req.body };
  writeJSON("content.json", next);
  logCompliance("content_updated", { keys: Object.keys(req.body) });
  res.json(next);
});

// ══════════════════════════════════════════════
//  API — IMAGE UPLOADS
// ══════════════════════════════════════════════
app.post("/api/upload", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  const relPath = path.relative(__dirname, req.file.path);
  logCompliance("image_uploaded", { path: relPath });
  res.json({ path: relPath });
});

// ══════════════════════════════════════════════
//  API — COMPLIANCE
// ══════════════════════════════════════════════
function logCompliance(action, detail) {
  const logFile = path.join(COMPLIANCE_DIR, "log.json");
  const log = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, "utf-8")) : [];
  log.push({
    timestamp: new Date().toISOString(),
    action,
    detail,
  });
  fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
}

// Take a compliance screenshot of a page
app.post("/api/compliance/screenshot", async (req, res) => {
  const pagePath = req.body.page || "/";
  const url = `http://localhost:${PORT}${pagePath.startsWith("/") ? pagePath : "/" + pagePath}`;
  try {
    const puppeteer = require("puppeteer");
    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 15000 });
    // Full page screenshot
    const filename = `screenshot-${pagePath.replace(/[^a-z0-9]/gi, "-")}-${Date.now()}.png`;
    const filepath = path.join(COMPLIANCE_DIR, "screenshots", filename);
    await page.screenshot({ path: filepath, fullPage: true });
    await browser.close();
    const entry = { timestamp: new Date().toISOString(), page: pagePath, file: filename };
    logCompliance("screenshot_taken", entry);
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload compliance approval email
app.post("/api/compliance/approval", approvalUpload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  const entry = {
    timestamp: new Date().toISOString(),
    file: req.file.filename,
    originalName: req.file.originalname,
    note: req.body.note || "",
  };
  logCompliance("approval_uploaded", entry);
  res.json(entry);
});

// Get compliance log
app.get("/api/compliance/log", (_req, res) => {
  const logFile = path.join(COMPLIANCE_DIR, "log.json");
  const log = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, "utf-8")) : [];
  res.json(log);
});

// Get list of screenshots
app.get("/api/compliance/screenshots", (_req, res) => {
  const dir = path.join(COMPLIANCE_DIR, "screenshots");
  if (!fs.existsSync(dir)) return res.json([]);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".png")).sort().reverse();
  res.json(files.map((f) => ({ file: f, url: `/compliance/screenshots/${f}` })));
});

// Get list of approvals
app.get("/api/compliance/approvals", (_req, res) => {
  const dir = path.join(COMPLIANCE_DIR, "approvals");
  if (!fs.existsSync(dir)) return res.json([]);
  const files = fs.readdirSync(dir).sort().reverse();
  res.json(files.map((f) => ({ file: f, url: `/compliance/approvals/${f}` })));
});

// Serve compliance files
app.use("/compliance", express.static(COMPLIANCE_DIR));

// ── Admin panel route ──
app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "admin", "index.html"));
});

// ── Start ──
app.listen(PORT, () => {
  console.log(`Steadfast CMS running at http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
});
