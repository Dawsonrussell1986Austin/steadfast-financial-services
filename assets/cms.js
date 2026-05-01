/* Steadfast CMS loader — hydrates pages from data/content.json and data/team.json.
 * Both files are maintained by the admin CMS (see /admin). Static fallback content
 * in the HTML keeps the page usable if the fetch fails or JS is disabled. */
(function () {
  const base = (document.body && document.body.getAttribute("data-base")) || "";

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toParagraphs(value) {
    return String(value)
      .split(/\n{2,}/)
      .map((p) => "<p>" + escapeHtml(p).replace(/\n/g, "<br />") + "</p>")
      .join("");
  }

  function toBreaks(value) {
    return escapeHtml(value).replace(/\n/g, "<br />");
  }

  function applyContent(content) {
    if (!content || typeof content !== "object") return;
    document.querySelectorAll("[data-cms]").forEach((el) => {
      const key = el.getAttribute("data-cms");
      const value = content[key];
      if (value == null || value === "") return;
      const mode = el.getAttribute("data-cms-mode") || "text";
      if (mode === "paragraphs") el.innerHTML = toParagraphs(value);
      else if (mode === "br") el.innerHTML = toBreaks(value);
      else if (mode === "list") {
        el.innerHTML = String(value)
          .split(/\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => "<li>" + escapeHtml(line) + "</li>")
          .join("");
      }
      else el.textContent = value;
    });
  }

  function renderTeam(team) {
    const mount = document.getElementById("teamGrid");
    if (!mount || !Array.isArray(team) || !team.length) return;
    mount.innerHTML = team
      .map((m) => {
        const photo = m.photo ? base + m.photo : "";
        const bioParas = (m.bio || "")
          .split(/\n{2,}/)
          .filter(Boolean)
          .map((p) => "<p>" + escapeHtml(p) + "</p>")
          .join("");
        const eduLines = (m.education || "")
          .split(/\n/)
          .filter(Boolean)
          .map(escapeHtml)
          .join("<br/>");
        const education = eduLines ? "<h4>Education</h4><p>" + eduLines + "</p>" : "";
        const personal = m.personal ? "<h4>Personal</h4><p>" + escapeHtml(m.personal) + "</p>" : "";
        const photoStyle = photo
          ? 'style="background-image: url(\'' + photo.replace(/'/g, "%27") + "'); background-position: center 18%;\""
          : "";
        return (
          '<article class="team-card">' +
            '<div class="team-photo" ' + photoStyle + "></div>" +
            '<div class="team-info">' +
              '<span class="title">' + escapeHtml(m.title || "") + "</span>" +
              "<h3>" + escapeHtml(m.name || "") + "</h3>" +
              (m.creds ? '<p class="creds">' + escapeHtml(m.creds) + "</p>" : "") +
              bioParas +
              education +
              personal +
            "</div>" +
          "</article>"
        );
      })
      .join("");
  }

  function applyImageOverrides(map) {
    if (!map || typeof map !== "object") return;
    const resolve = (src) => {
      if (!src) return null;
      if (map[src]) return map[src];
      // Tolerate a leading "./" or base prefix on the document side.
      const stripped = src.replace(/^\.\//, "").replace(new RegExp("^" + base), "");
      if (map[stripped]) return map[stripped];
      return null;
    };
    document.querySelectorAll("img[src]").forEach((img) => {
      const next = resolve(img.getAttribute("src"));
      if (next) img.setAttribute("src", base + next);
    });
    document.querySelectorAll("video[poster]").forEach((v) => {
      const next = resolve(v.getAttribute("poster"));
      if (next) v.setAttribute("poster", base + next);
    });
    document.querySelectorAll("video > source[src]").forEach((s) => {
      const next = resolve(s.getAttribute("src"));
      if (next) {
        s.setAttribute("src", base + next);
        const parent = s.parentElement;
        if (parent && typeof parent.load === "function") parent.load();
      }
    });
    document.querySelectorAll("[style*='background-image']").forEach((el) => {
      const style = el.getAttribute("style") || "";
      const next = style.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g, (full, url) => {
        const r = resolve(url);
        return r ? "url('" + base + r + "')" : full;
      });
      if (next !== style) el.setAttribute("style", next);
    });
  }

  let liveContent = {};
  fetch(base + "data/content.json", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data) {
        liveContent = data;
        applyContent(liveContent);
      }
    })
    .catch(() => {});

  // Live preview channel: when this page is embedded in the admin Site Content
  // editor, the parent posts unsaved edits and we re-apply them on the fly.
  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type !== "steadfast:preview-content") return;
    const next = Object.assign({}, liveContent, msg.content || {});
    applyContent(next);
  });
  // Announce readiness so the parent can push the current draft.
  if (window.parent && window.parent !== window) {
    try { window.parent.postMessage({ type: "steadfast:preview-ready" }, "*"); } catch (e) {}
  }

  fetch(base + "data/image-overrides.json", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => data && applyImageOverrides(data))
    .catch(() => {});

  if (document.getElementById("teamGrid")) {
    fetch(base + "data/team.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && renderTeam(data))
      .catch(() => {});
  }
})();
