/* Steadfast CMS Admin — Client-side JS */
(function () {
  // ── Panel switching ──
  const tabs = document.querySelectorAll(".admin-tab");
  const panels = document.querySelectorAll(".panel");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      const id = tab.dataset.panel;
      panels.forEach((p) => (p.style.display = p.id === "panel-" + id ? "" : "none"));
      // Refresh data when switching
      if (id === "articles") loadArticles();
      if (id === "team") loadTeam();
      if (id === "content") loadContent();
      if (id === "compliance") loadCompliance();
    });
  });

  // ═══════════════════════════════════════
  //  ARTICLES
  // ═══════════════════════════════════════
  const articlesList = document.getElementById("articlesList");
  const articleModal = document.getElementById("articleModal");
  const articleForm = document.getElementById("articleForm");

  function loadArticles() {
    fetch("/api/articles")
      .then((r) => r.json())
      .then((articles) => {
        articles.sort((a, b) => new Date(b.date) - new Date(a.date));
        if (!articles.length) {
          articlesList.innerHTML = '<p style="color:#5c6a63;padding:20px;">No articles yet. Click "+ New Article" to create one.</p>';
          return;
        }
        articlesList.innerHTML = articles
          .map(
            (a) => `
          <div class="list-card">
            <div class="list-card-body">
              <h4><span class="card-badge">${a.category}</span>${esc(a.title)}</h4>
              <p>${esc(a.summary)}</p>
            </div>
            <div class="list-card-meta">${a.date}</div>
            <div class="list-card-actions">
              <button class="btn-admin" onclick="editArticle('${a.id}')">Edit</button>
              <button class="btn-admin btn-danger" onclick="deleteArticle('${a.id}')">Delete</button>
            </div>
          </div>`
          )
          .join("");
      });
  }

  window.editArticle = function (id) {
    fetch("/api/articles")
      .then((r) => r.json())
      .then((articles) => {
        const a = articles.find((x) => x.id === id);
        if (!a) return;
        document.getElementById("artId").value = a.id;
        document.getElementById("artTitle").value = a.title;
        document.getElementById("artDate").value = a.date;
        document.getElementById("artCategory").value = a.category;
        document.getElementById("artAuthor").value = a.author || "";
        document.getElementById("artSummary").value = a.summary;
        document.getElementById("artImage").value = a.image || "";
        document.getElementById("artLink").value = a.link || "";
        document.getElementById("articleModalTitle").textContent = "Edit Article";
        articleModal.classList.add("is-open");
      });
  };

  window.deleteArticle = function (id) {
    if (!confirm("Delete this article?")) return;
    fetch("/api/articles/" + id, { method: "DELETE" }).then(() => loadArticles());
  };

  document.getElementById("btnNewArticle").addEventListener("click", () => {
    articleForm.reset();
    document.getElementById("artId").value = "";
    document.getElementById("artDate").value = new Date().toISOString().slice(0, 10);
    document.getElementById("articleModalTitle").textContent = "New Article";
    articleModal.classList.add("is-open");
  });

  document.getElementById("articleModalClose").addEventListener("click", () => articleModal.classList.remove("is-open"));
  document.getElementById("articleModalCancel").addEventListener("click", () => articleModal.classList.remove("is-open"));

  articleForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("artId").value;
    const body = {
      title: document.getElementById("artTitle").value,
      date: document.getElementById("artDate").value,
      category: document.getElementById("artCategory").value,
      author: document.getElementById("artAuthor").value,
      summary: document.getElementById("artSummary").value,
      image: document.getElementById("artImage").value,
      link: document.getElementById("artLink").value,
    };
    const url = id ? "/api/articles/" + id : "/api/articles";
    const method = id ? "PUT" : "POST";
    fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(() => {
      articleModal.classList.remove("is-open");
      loadArticles();
    });
  });

  // ═══════════════════════════════════════
  //  TEAM
  // ═══════════════════════════════════════
  const teamList = document.getElementById("teamList");
  const teamModal = document.getElementById("teamModal");
  const teamForm = document.getElementById("teamForm");
  let teamData = [];

  function loadTeam() {
    fetch("/api/team")
      .then((r) => r.json())
      .then((team) => {
        teamData = team;
        if (!team.length) {
          teamList.innerHTML = '<p style="color:#5c6a63;padding:20px;">No team data loaded. Add team members or import from the site.</p>';
          return;
        }
        teamList.innerHTML = team
          .map(
            (m, i) => `
          <div class="list-card">
            <div class="list-card-body">
              <h4>${esc(m.name)}</h4>
              <p>${esc(m.title)} — ${esc(m.creds || "")}</p>
            </div>
            <div class="list-card-actions">
              <button class="btn-admin" onclick="editTeam(${i})">Edit</button>
              <button class="btn-admin btn-danger" onclick="deleteTeam(${i})">Remove</button>
            </div>
          </div>`
          )
          .join("");
      });
  }

  window.editTeam = function (idx) {
    const m = teamData[idx];
    if (!m) return;
    document.getElementById("tmIdx").value = idx;
    document.getElementById("tmName").value = m.name;
    document.getElementById("tmTitle").value = m.title;
    document.getElementById("tmCreds").value = m.creds || "";
    document.getElementById("tmBio").value = m.bio || "";
    document.getElementById("tmEdu").value = m.education || "";
    document.getElementById("tmPersonal").value = m.personal || "";
    document.getElementById("tmPhoto").value = m.photo || "";
    document.getElementById("teamModalTitle").textContent = "Edit " + m.name;
    teamModal.classList.add("is-open");
  };

  window.deleteTeam = function (idx) {
    if (!confirm("Remove this team member?")) return;
    teamData.splice(idx, 1);
    fetch("/api/team", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(teamData),
    }).then(() => loadTeam());
  };

  document.getElementById("btnNewTeam").addEventListener("click", () => {
    teamForm.reset();
    document.getElementById("tmIdx").value = "-1";
    document.getElementById("teamModalTitle").textContent = "Add Team Member";
    teamModal.classList.add("is-open");
  });

  document.getElementById("teamModalClose").addEventListener("click", () => teamModal.classList.remove("is-open"));
  document.getElementById("teamModalCancel").addEventListener("click", () => teamModal.classList.remove("is-open"));

  teamForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const idx = parseInt(document.getElementById("tmIdx").value, 10);
    const member = {
      name: document.getElementById("tmName").value,
      title: document.getElementById("tmTitle").value,
      creds: document.getElementById("tmCreds").value,
      bio: document.getElementById("tmBio").value,
      education: document.getElementById("tmEdu").value,
      personal: document.getElementById("tmPersonal").value,
      photo: document.getElementById("tmPhoto").value,
    };
    if (idx >= 0 && idx < teamData.length) {
      teamData[idx] = member;
    } else {
      teamData.push(member);
    }
    fetch("/api/team", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(teamData),
    }).then(() => {
      teamModal.classList.remove("is-open");
      loadTeam();
    });
  });

  // ═══════════════════════════════════════
  //  SITE CONTENT
  // ═══════════════════════════════════════
  const CONTENT_KEYS = [
    { key: "hero_headline", label: "Home — Hero Headline" },
    { key: "hero_subtext", label: "Home — Hero Subtext" },
    { key: "whatwedo_headline", label: "Home — What We Do Headline" },
    { key: "whatwedo_body", label: "Home — What We Do Body" },
    { key: "whoweare_headline", label: "Home — Who We Are Headline" },
    { key: "whoweare_body", label: "Home — Who We Are Body" },
    { key: "values_headline", label: "Home — Values Headline" },
    { key: "values_body", label: "Home — Values Subtext" },
    { key: "contact_headline", label: "Home — Contact Headline" },
    { key: "contact_body", label: "Home — Contact Body" },
    { key: "fp_lede", label: "Financial Planning — Intro" },
    { key: "im_lede", label: "Investment Management — Intro" },
    { key: "team_headline", label: "Our People — Team Headline" },
    { key: "team_body", label: "Our People — Team Body" },
  ];

  const contentFields = document.getElementById("contentFields");

  function loadContent() {
    fetch("/api/content")
      .then((r) => r.json())
      .then((data) => {
        contentFields.innerHTML = CONTENT_KEYS.map(
          (k) => `
          <div class="content-field">
            <label>${k.label}</label>
            <textarea data-key="${k.key}" rows="3">${esc(data[k.key] || "")}</textarea>
          </div>`
        ).join("");
      });
  }

  document.getElementById("btnSaveContent").addEventListener("click", () => {
    const body = {};
    contentFields.querySelectorAll("textarea").forEach((ta) => {
      body[ta.dataset.key] = ta.value;
    });
    fetch("/api/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(() => alert("Content saved."));
  });

  // ═══════════════════════════════════════
  //  IMAGE UPLOAD
  // ═══════════════════════════════════════
  const uploadForm = document.getElementById("uploadForm");
  const uploadResult = document.getElementById("uploadResult");

  uploadForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const file = document.getElementById("uploadFile").files[0];
    if (!file) return alert("Choose a file first.");
    const dir = document.getElementById("uploadDir").value;
    const fd = new FormData();
    fd.append("image", file);
    fetch("/api/upload?dir=" + dir, { method: "POST", body: fd })
      .then((r) => r.json())
      .then((data) => {
        uploadResult.textContent = "Uploaded: " + data.path;
        uploadResult.classList.add("show");
      })
      .catch(() => {
        uploadResult.textContent = "Upload failed.";
        uploadResult.classList.add("show");
      });
  });

  // ═══════════════════════════════════════
  //  COMPLIANCE
  // ═══════════════════════════════════════
  function loadCompliance() {
    // Screenshots
    fetch("/api/compliance/screenshots")
      .then((r) => r.json())
      .then((files) => {
        const el = document.getElementById("screenshotsList");
        if (!files.length) {
          el.innerHTML = '<p style="color:#5c6a63;padding:12px;">No screenshots yet.</p>';
          return;
        }
        el.innerHTML = files
          .map(
            (f) => `
          <div class="archive-item">
            <a href="${f.url}" target="_blank">${f.file}</a>
            <span class="archive-date">${parseTimestamp(f.file)}</span>
          </div>`
          )
          .join("");
      });

    // Approvals
    fetch("/api/compliance/approvals")
      .then((r) => r.json())
      .then((files) => {
        const el = document.getElementById("approvalsList");
        if (!files.length) {
          el.innerHTML = '<p style="color:#5c6a63;padding:12px;">No approval documents uploaded.</p>';
          return;
        }
        el.innerHTML = files
          .map(
            (f) => `
          <div class="archive-item">
            <a href="${f.url}" target="_blank">${f.file}</a>
          </div>`
          )
          .join("");
      });

    // Change log
    fetch("/api/compliance/log")
      .then((r) => r.json())
      .then((log) => {
        const el = document.getElementById("complianceLog");
        if (!log.length) {
          el.innerHTML = '<p style="color:#5c6a63;padding:16px;">No changes logged yet.</p>';
          return;
        }
        el.innerHTML = log
          .reverse()
          .slice(0, 100)
          .map(
            (entry) => `
          <div class="log-row">
            <span class="log-time">${new Date(entry.timestamp).toLocaleString()}</span>
            <span class="log-action">${esc(entry.action)}</span>
            <span class="log-detail">${esc(JSON.stringify(entry.detail))}</span>
          </div>`
          )
          .join("");
      });
  }

  // Screenshot button
  document.getElementById("btnScreenshot").addEventListener("click", () => {
    const page = document.getElementById("screenshotPage").value;
    const status = document.getElementById("screenshotStatus");
    status.textContent = "Capturing...";
    status.className = "status-msg";
    fetch("/api/compliance/screenshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          status.textContent = "Error: " + data.error;
          status.className = "status-msg error";
        } else {
          status.textContent = "Screenshot saved: " + data.file;
          loadCompliance();
        }
      })
      .catch(() => {
        status.textContent = "Failed to capture screenshot.";
        status.className = "status-msg error";
      });
  });

  // Approval upload
  document.getElementById("approvalForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const file = document.getElementById("approvalFile").files[0];
    if (!file) return alert("Choose a file.");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("note", document.getElementById("approvalNote").value);
    const status = document.getElementById("approvalStatus");
    status.textContent = "Uploading...";
    fetch("/api/compliance/approval", { method: "POST", body: fd })
      .then((r) => r.json())
      .then((data) => {
        status.textContent = "Uploaded: " + data.file;
        document.getElementById("approvalForm").reset();
        loadCompliance();
      })
      .catch(() => {
        status.textContent = "Upload failed.";
        status.className = "status-msg error";
      });
  });

  // ── Helpers ──
  function esc(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function parseTimestamp(filename) {
    const match = filename.match(/(\d{13})/);
    if (match) return new Date(parseInt(match[1], 10)).toLocaleString();
    return "";
  }

  // ── Initial load ──
  loadArticles();
})();
