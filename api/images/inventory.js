/* Vercel serverless function: GET /api/images/inventory
 *
 * Scans the bundled HTML files (and the shared partials.js) for every image
 * reference — <img src>, inline background-image, <video poster>, and
 * <source src> — and returns them grouped by page.
 *
 * The page files are pulled into the function bundle at deploy time via
 * vercel.json's `functions["api/images/inventory.js"].includeFiles` entry.
 * Override records are read separately from Supabase on the client. */

import fs from "node:fs";
import path from "node:path";

const SITE_PAGES = [
  { file: "index.html",                    label: "Home" },
  { file: "financial-planning.html",       label: "Financial Planning" },
  { file: "investment-management.html",    label: "Investment Management" },
  { file: "our-people.html",               label: "Our People" },
  { file: "resources.html",                label: "Resources" },
  { file: "links.html",                    label: "Links" },
  { file: "contact-us.html",               label: "Contact Us" },
];

function scanImagesInHtml(html) {
  const found = [];
  const seen = new Set();
  const push = (src, alt, kind) => {
    if (!src) return;
    if (/^https?:/i.test(src)) return;
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

function scanSharedPartials(root) {
  const fp = path.join(root, "assets", "partials.js");
  if (!fs.existsSync(fp)) return [];
  const js = fs.readFileSync(fp, "utf-8");
  const imgRe = /['"`]([^'"`]*\.(?:png|jpg|jpeg|svg|webp|gif))['"`]/gi;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = imgRe.exec(js))) {
    const raw = m[1];
    const src = raw.replace(/\$\{[^}]+\}/g, ""); // strip template-literal interpolations
    if (!src || /^https?:/i.test(src) || seen.has(src)) continue;
    seen.add(src);
    out.push({ src, alt: "shared partial", kind: "img" });
  }
  return out;
}

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const root = process.cwd();

    const shared = {
      file: "assets/partials.js",
      label: "Shared (Header & Footer)",
      images: scanSharedPartials(root),
    };

    const pages = SITE_PAGES.map((p) => {
      const fp = path.join(root, p.file);
      if (!fs.existsSync(fp)) return { file: p.file, label: p.label, images: [] };
      const html = fs.readFileSync(fp, "utf-8");
      return { file: p.file, label: p.label, images: scanImagesInHtml(html) };
    });

    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
    return res.status(200).json({ pages: [shared, ...pages] });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
}
