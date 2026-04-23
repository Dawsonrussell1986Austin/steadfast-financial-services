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
//  API — IMAGE INVENTORY & REPLACEMENT
// ══════════════════════════════════════════════
// Pages to scan. Each entry is { file, label }.
const SITE_PAGES = [
  { file: "index.html", label: "Home" },
  { file: "financial-planning.html", label: "Financial Planning" },
  { file: "investment-management.html", label: "Investment Management" },
  { file: "our-people.html", label: "Our People" },
  { file: "resources.html", label: "Resources" },
  { file: "links.html", label: "Links" },
  { file: "contact-us.html", label: "Contact Us" },
];

// Scan an HTML string for image references. Returns an array of { src, alt, kind }.
function scanImagesInHtml(html) {
  const found = [];
  const seen = new Set();
  const push = (src, alt, kind) => {
    if (!src) return;
    if (/^https?:/i.test(src)) return; // skip remote images
    if (/^data:/i.test(src)) return;
    const key = kind + "|" + src;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ src, alt: alt || "", kind });
  };
  let m;
  const imgRe = /<img\b([^>]*)>/gi;
  while ((m = imgRe.exec(html))) {
    const attrs = m[1];
    const srcM = attrs.match(/\bsrc=["']([^"']+)["']/i);
    const altM = attrs.match(/\balt=["']([^"']*)["']/i);
    if (srcM) push(srcM[1], altM ? altM[1] : "", "img");
  }
  const bgRe = /background-image:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  while ((m = bgRe.exec(html))) push(m[1], "", "background");
  const posterRe = /<video\b[^>]*\bposter=["']([^"']+)["'][^>]*>/gi;
  while ((m = posterRe.exec(html))) push(m[1], "hero video poster", "poster");
  const sourceRe = /<source\b[^>]*\bsrc=["']([^"']+\.(?:mp4|webm|ogg))["'][^>]*>/gi;
  while ((m = sourceRe.exec(html))) push(m[1], "hero video", "video");
  return found;
}

function readOverrides() {
  return readJSON("image-overrides.json") || {};
}

function writeOverrides(map) {
  writeJSON("image-overrides.json", map);
}

app.get("/api/images/inventory", (_req, res) => {
  const overrides = readOverrides();
  const pages = SITE_PAGES.map((p) => {
    const fp = path.join(__dirname, p.file);
    if (!fs.existsSync(fp)) return { file: p.file, label: p.label, images: [] };
    const html = fs.readFileSync(fp, "utf-8");
    const images = scanImagesInHtml(html).map((img) => ({
      ...img,
      override: overrides[img.src] || null,
    }));
    return { file: p.file, label: p.label, images };
  });
  // Shared partials (header/footer) scan
  const partialsPath = path.join(__dirname, "assets", "partials.js");
  const shared = { file: "assets/partials.js", label: "Shared (Header & Footer)", images: [] };
  if (fs.existsSync(partialsPath)) {
    const js = fs.readFileSync(partialsPath, "utf-8");
    const imgRe = /['"`]([^'"`]*\.(?:png|jpg|jpeg|svg|webp|gif))['"`]/gi;
    const seen = new Set();
    let m;
    while ((m = imgRe.exec(js))) {
      const raw = m[1];
      // Strip ${base} template substitution markers
      const src = raw.replace(/\$\{[^}]+\}/g, "");
      if (!src || /^https?:/i.test(src) || seen.has(src)) continue;
      seen.add(src);
      shared.images.push({ src, alt: "shared partial", kind: "img", override: overrides[src] || null });
    }
  }
  res.json({ pages: [shared, ...pages], overrides });
});

app.get("/api/images/overrides", (_req, res) => {
  res.json(readOverrides());
});

// Upload a replacement image for a specific original src.
// Form fields: original (string), file (binary)
const replaceStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = file.originalname
      .replace(ext, "")
      .replace(/[^a-z0-9-_]/gi, "-")
      .toLowerCase();
    cb(null, "replace-" + base + "-" + Date.now() + ext);
  },
});
const replaceUpload = multer({
  storage: replaceStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

app.post("/api/images/replace", replaceUpload.single("file"), (req, res) => {
  const original = (req.body.original || "").trim();
  if (!original) return res.status(400).json({ error: "Missing 'original' field" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const replacement = path.relative(__dirname, req.file.path).replace(/\\/g, "/");
  const overrides = readOverrides();
  overrides[original] = replacement;
  writeOverrides(overrides);
  logCompliance("image_replaced", { original, replacement });
  res.json({ original, replacement });
});

// Revert a single override (restore original image).
app.post("/api/images/revert", (req, res) => {
  const original = (req.body.original || "").trim();
  if (!original) return res.status(400).json({ error: "Missing 'original' field" });
  const overrides = readOverrides();
  const prev = overrides[original] || null;
  delete overrides[original];
  writeOverrides(overrides);
  logCompliance("image_reverted", { original, previous: prev });
  res.json({ original, reverted: prev });
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
