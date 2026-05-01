/* Steadfast CMS Admin — Supabase-backed client.
 * Requires the user to be signed in via login.html. RLS policies on the
 * database restrict writes to authenticated users.
 *
 * Publishing: the admin edits Supabase tables live. Clicking "Publish" calls
 * the /api/publish serverless function, which exports the current Supabase
 * state to data/*.json in the repo and commits via the GitHub API. Vercel
 * then auto-redeploys the public site. */

import { supabase, requireSession, signOut, escapeHtml } from "./supabase-client.js";

// ── Session gate ──────────────────────────────────────────────
const session = await requireSession();
if (!session) {
  // requireSession already redirected; bail out of module execution.
  throw new Error("not signed in");
}

// ── Header actions ────────────────────────────────────────────
document.getElementById("btnSignOut").addEventListener("click", signOut);
document.getElementById("btnPublish").addEventListener("click", publish);

// ── Toast helper ──────────────────────────────────────────────
const toastEl = document.getElementById("toast");
let toastTimer = null;
function toast(msg, kind = "info") {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.className = "toast show toast-" + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.className = "toast"), 3600);
}

// ── Panel switching ───────────────────────────────────────────
const tabs = document.querySelectorAll(".admin-tab");
const panels = document.querySelectorAll(".panel");
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    const id = tab.dataset.panel;
    panels.forEach((p) => (p.style.display = p.id === "panel-" + id ? "" : "none"));
    if (id === "articles") loadArticles();
    if (id === "team") loadTeam();
    if (id === "content") loadContent();
    if (id === "messages") loadMessages();
    if (id === "links") loadClientLinks();
    if (id === "images") loadImagesInventory();
    if (id === "compliance") loadCompliance();
  });
});

// ═══════════════════════════════════════════════════════════════
//  ARTICLES
// ═══════════════════════════════════════════════════════════════
const articlesList = document.getElementById("articlesList");
const articleModal = document.getElementById("articleModal");
const articleForm = document.getElementById("articleForm");

async function loadArticles() {
  const { data: articles, error } = await supabase
    .from("articles")
    .select("*")
    .order("date", { ascending: false });
  if (error) return toast("Load failed: " + error.message, "error");
  if (!articles.length) {
    articlesList.innerHTML = '<p style="color:#5c6a63;padding:20px;">No articles yet. Click "+ New Article" to create one.</p>';
    return;
  }
  articlesList.innerHTML = articles
    .map(
      (a) => `
        <div class="list-card">
          <div class="list-card-body">
            <h4><span class="card-badge">${escapeHtml(a.category)}</span>${escapeHtml(a.title)}</h4>
            <p>${escapeHtml(a.summary)}</p>
          </div>
          <div class="list-card-meta">${a.date}</div>
          <div class="list-card-actions">
            <button class="btn-admin" data-edit-article="${a.id}">Edit</button>
            <button class="btn-admin btn-danger" data-del-article="${a.id}">Delete</button>
          </div>
        </div>`
    )
    .join("");

  articlesList.querySelectorAll("[data-edit-article]").forEach((b) =>
    b.addEventListener("click", () => editArticle(b.getAttribute("data-edit-article")))
  );
  articlesList.querySelectorAll("[data-del-article]").forEach((b) =>
    b.addEventListener("click", () => deleteArticle(b.getAttribute("data-del-article")))
  );
}

async function editArticle(id) {
  const { data: a, error } = await supabase.from("articles").select("*").eq("id", id).single();
  if (error || !a) return toast("Could not load article.", "error");
  document.getElementById("artId").value = a.id;
  document.getElementById("artTitle").value = a.title;
  document.getElementById("artDate").value = a.date;
  document.getElementById("artCategory").value = a.category;
  document.getElementById("artAuthor").value = a.author || "";
  document.getElementById("artSummary").value = a.summary;
  document.getElementById("artImage").value = a.image || "";
  document.getElementById("artLink").value = a.link || "";
  document.getElementById("articleModalTitle").textContent = "Edit Article";
  if (artImageStatusEl) artImageStatusEl.textContent = "";
  renderArtImagePreview();
  articleModal.classList.add("is-open");
}

async function deleteArticle(id) {
  if (!confirm("Delete this article?")) return;
  const { error } = await supabase.from("articles").delete().eq("id", id);
  if (error) return toast("Delete failed: " + error.message, "error");
  toast("Article deleted");
  loadArticles();
}

document.getElementById("btnNewArticle").addEventListener("click", () => {
  articleForm.reset();
  document.getElementById("artId").value = "";
  document.getElementById("artDate").value = new Date().toISOString().slice(0, 10);
  document.getElementById("articleModalTitle").textContent = "New Article";
  if (artImageStatusEl) artImageStatusEl.textContent = "";
  renderArtImagePreview();
  articleModal.classList.add("is-open");
});

document.getElementById("articleModalClose").addEventListener("click", () =>
  articleModal.classList.remove("is-open")
);
document.getElementById("articleModalCancel").addEventListener("click", () =>
  articleModal.classList.remove("is-open")
);

const artImageEl = document.getElementById("artImage");
const artImageFileEl = document.getElementById("artImageFile");
const artImageUploadBtn = document.getElementById("artImageUploadBtn");
const artImageStatusEl = document.getElementById("artImageStatus");
const artImagePreviewEl = document.getElementById("artImagePreview");

function renderArtImagePreview() {
  if (!artImagePreviewEl) return;
  const url = artImageEl.value.trim();
  artImagePreviewEl.innerHTML = url
    ? `<img src="${escapeHtml(url)}" alt="Article image preview" />`
    : "";
}
artImageEl.addEventListener("input", renderArtImagePreview);

if (artImageUploadBtn && artImageFileEl) {
  artImageUploadBtn.addEventListener("click", () => artImageFileEl.click());
  artImageFileEl.addEventListener("change", async () => {
    const file = artImageFileEl.files[0];
    if (!file) return;
    artImageStatusEl.textContent = "Uploading…";
    artImageStatusEl.className = "image-upload-status";
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const safe = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-_]/gi, "-").toLowerCase().slice(0, 60);
      const now = new Date();
      const objectPath =
        "articles/" +
        now.getUTCFullYear() + "/" +
        String(now.getUTCMonth() + 1).padStart(2, "0") + "/" +
        safe + "-" + now.getTime() + "." + ext;
      const up = await supabase.storage.from("site-images").upload(objectPath, file, {
        contentType: file.type || "image/" + ext,
        upsert: false,
      });
      if (up.error) throw up.error;
      const { data: pub } = supabase.storage.from("site-images").getPublicUrl(objectPath);
      artImageEl.value = pub.publicUrl;
      renderArtImagePreview();
      artImageStatusEl.textContent = "Uploaded";
    } catch (err) {
      artImageStatusEl.textContent = "Failed: " + (err.message || err);
      artImageStatusEl.className = "image-upload-status error";
    } finally {
      artImageFileEl.value = "";
    }
  });
}

articleForm.addEventListener("submit", async (e) => {
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
  const { error } = id
    ? await supabase.from("articles").update(body).eq("id", id)
    : await supabase.from("articles").insert(body);
  if (error) return toast("Save failed: " + error.message, "error");
  toast(id ? "Article updated" : "Article created");
  articleModal.classList.remove("is-open");
  loadArticles();
});

// ═══════════════════════════════════════════════════════════════
//  TEAM
// ═══════════════════════════════════════════════════════════════
const teamList = document.getElementById("teamList");
const teamModal = document.getElementById("teamModal");
const teamForm = document.getElementById("teamForm");
let teamData = [];

async function loadTeam() {
  const { data, error } = await supabase
    .from("team_members")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) return toast("Load failed: " + error.message, "error");
  teamData = data || [];
  if (!teamData.length) {
    teamList.innerHTML = '<p style="color:#5c6a63;padding:20px;">No team members yet.</p>';
    return;
  }
  teamList.innerHTML = teamData
    .map(
      (m) => `
        <div class="list-card">
          <div class="list-card-body">
            <h4>${escapeHtml(m.name)}</h4>
            <p>${escapeHtml(m.title)} — ${escapeHtml(m.creds || "")}</p>
          </div>
          <div class="list-card-actions">
            <button class="btn-admin" data-edit-team="${m.id}">Edit</button>
            <button class="btn-admin btn-danger" data-del-team="${m.id}">Remove</button>
          </div>
        </div>`
    )
    .join("");
  teamList.querySelectorAll("[data-edit-team]").forEach((b) =>
    b.addEventListener("click", () => editTeam(b.getAttribute("data-edit-team")))
  );
  teamList.querySelectorAll("[data-del-team]").forEach((b) =>
    b.addEventListener("click", () => deleteTeam(b.getAttribute("data-del-team")))
  );
}

function editTeam(id) {
  const m = teamData.find((x) => x.id === id);
  if (!m) return;
  document.getElementById("tmIdx").value = m.id;
  document.getElementById("tmName").value = m.name;
  document.getElementById("tmTitle").value = m.title;
  document.getElementById("tmCreds").value = m.creds || "";
  document.getElementById("tmBio").value = m.bio || "";
  document.getElementById("tmEdu").value = m.education || "";
  document.getElementById("tmPersonal").value = m.personal || "";
  document.getElementById("tmPhoto").value = m.photo || "";
  document.getElementById("teamModalTitle").textContent = "Edit " + m.name;
  teamModal.classList.add("is-open");
}

async function deleteTeam(id) {
  if (!confirm("Remove this team member?")) return;
  const { error } = await supabase.from("team_members").delete().eq("id", id);
  if (error) return toast("Delete failed: " + error.message, "error");
  toast("Member removed");
  loadTeam();
}

document.getElementById("btnNewTeam").addEventListener("click", () => {
  teamForm.reset();
  document.getElementById("tmIdx").value = "";
  document.getElementById("teamModalTitle").textContent = "Add Team Member";
  teamModal.classList.add("is-open");
});

document.getElementById("teamModalClose").addEventListener("click", () =>
  teamModal.classList.remove("is-open")
);
document.getElementById("teamModalCancel").addEventListener("click", () =>
  teamModal.classList.remove("is-open")
);

teamForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("tmIdx").value;
  const maxOrder = teamData.reduce((n, m) => Math.max(n, m.sort_order || 0), 0);
  const member = {
    name: document.getElementById("tmName").value,
    title: document.getElementById("tmTitle").value,
    creds: document.getElementById("tmCreds").value,
    bio: document.getElementById("tmBio").value,
    education: document.getElementById("tmEdu").value,
    personal: document.getElementById("tmPersonal").value,
    photo: document.getElementById("tmPhoto").value,
  };
  const { error } = id
    ? await supabase.from("team_members").update(member).eq("id", id)
    : await supabase.from("team_members").insert({ ...member, sort_order: maxOrder + 10 });
  if (error) return toast("Save failed: " + error.message, "error");
  toast(id ? "Member updated" : "Member added");
  teamModal.classList.remove("is-open");
  loadTeam();
});

// ═══════════════════════════════════════════════════════════════
//  SITE CONTENT
// ═══════════════════════════════════════════════════════════════
const CONTENT_KEYS = [
  // ── Home ───────────────────────────────────────────────────
  { key: "hero_headline",        label: "Hero Headline",                  page: "Home",
    default: "A Steady Hand For Your Financial Journey" },
  { key: "hero_eyebrow",         label: "Hero Eyebrow",                   page: "Home",
    default: "SINCE 1998 · FEE-ONLY FIDUCIARY" },
  { key: "hero_subtext",         label: "Hero Subtext",                   page: "Home",
    default: "Financial resources aren't an end in themselves — they're a tool for accomplishing goals. Through thoughtful planning and disciplined investment management, we chart a steady course toward lasting financial peace of mind." },
  { key: "whatwedo_eyebrow",     label: "What We Do — Eyebrow",           page: "Home",
    default: "WHAT WE DO" },
  { key: "whatwedo_headline",    label: "What We Do — Headline",          page: "Home",
    default: "Built Around You.\nBacked By Experience." },
  { key: "whatwedo_body",        label: "What We Do — Body",              page: "Home",
    default: "We deliver comprehensive, tax-aware financial planning and disciplined investment management — whether as a comprehensive financial plan or an investment management engagement. Our advice and counsel is driven by your priorities, and applied uniquely to you.\n\nSince 1998, we've partnered with individuals, business owners, foundations, and families who rely on us for wise, independent financial counsel — one rooted in close relationships, low client-to-advisor ratios, and a steady, personal level of service you can count on for the long term." },
  { key: "howwehelp_headline",   label: "How We Help — Headline",         page: "Home",
    default: "Comprehensive Services\nAligned With Your Goals" },
  { key: "howwehelp_lead",       label: "How We Help — Lead",             page: "Home",
    default: "Whether you're building wealth, raising a family, or moving confidently into retirement, our services are designed to help you pursue your financial objectives through disciplined investment management and thorough planning." },
  { key: "whoweare_headline",    label: "Who We Are — Headline",          page: "Home",
    default: "Built On Trust.\nFocused On Results." },
  { key: "whoweare_body",        label: "Who We Are — Body",              page: "Home",
    default: "Your relationship with your advisor should be built on trust and transparency. We combine personalized service with deep investment expertise so you feel confident in both our approach and our commitment to your long-term success.\n\nFounded in 1998 and now led by Matthew McGahey, CFP®, ChFC®, RICP®, CKA®, Steadfast has served families and individuals across Central Florida and beyond — offering independent, fee-only counsel you can rely on through every stage of life." },
  { key: "values_headline",      label: "Values — Headline",              page: "Home",
    default: "The Principles That Guide Our Work" },
  { key: "values_body",          label: "Values — Subtext",               page: "Home",
    default: "Our philosophy is simple: everyone deserves access to advanced planning and disciplined investment strategies. We're committed to hard-working families who value a partnership approach to wealth management." },
  { key: "contact_headline",     label: "Contact — Headline",             page: "Home",
    default: "Ready To See What\nSteady Guidance Can Do?" },
  { key: "contact_body",         label: "Contact — Body",                 page: "Home",
    default: "Your financial journey deserves a trusted partner. Through fee-only planning and disciplined investment management, we'll help you pursue your goals with clarity and confidence. Contact us today to discuss how our approach could work for your unique situation." },

  // ── Financial Planning ─────────────────────────────────────
  { key: "fp_hero_h1",           label: "Hero Headline",                  page: "Financial Planning",
    default: "Financial Planning" },
  { key: "fp_hero_sub",          label: "Hero Subtext",                   page: "Financial Planning",
    default: "Comprehensive guidance through every major planning area — so your resources work toward the goals that matter most." },
  { key: "fp_lede",              label: "Approach Intro",                 page: "Financial Planning",
    default: "For financial planning clients, we offer comprehensive coverage of all major areas of financial planning. We collaborate throughout the process by presenting multiple alternatives and educating you on tax code changes, risk management, and the decisions you face at each stage of life. For married couples, active participation from both spouses is strongly encouraged." },
  { key: "fp_included_h2",       label: "What's Included — Headline",     page: "Financial Planning",
    default: "All Major Planning Areas,\nUnder One Trusted Roof" },
  { key: "fp_included_body",     label: "What's Included — Body",         page: "Financial Planning",
    default: "Our planning engagements cover the full picture — from goal setting and cash flow to survivor needs and estate planning — so nothing important falls through the cracks." },
  { key: "fp_included_list",     label: "What's Included — List (one per line)", page: "Financial Planning",
    default: "Goal setting and decision making\nNet worth review & comparative analysis\nRetirement planning\nIncome tax projections & planning\nCash flow projections\nEstate tax planning\nSurvivor needs analysis\nInvestment analysis & recommendations\nGift planning\nCollege education planning" },
  { key: "fp_process_h2",        label: "How We Work — Headline",         page: "Financial Planning",
    default: "A Collaborative,\nTransparent Process" },
  { key: "fp_process_lead",      label: "How We Work — Lead",             page: "Financial Planning",
    default: "Planning is a conversation — not a transaction. We believe clarity comes from an open dialogue about your full financial picture, education, considering the alternatives, making a plan, and updating it along the way." },
  { key: "fp_pricing_h2",        label: "Pricing — Headline",             page: "Financial Planning",
    default: "Time- & Complexity-Based,\nNever Commission-Based" },
  { key: "fp_pricing_body",      label: "Pricing — Body",                 page: "Financial Planning",
    default: "Because we are a fee-only fiduciary, your fees are transparent and tied to the scope of work — not to product sales. You can choose a single comprehensive engagement or ongoing annual planning with yearly revisions.\n\nEither way, you know exactly what you're paying for. We always work in your best interest — no hidden commissions." },

  // ── Investment Management ──────────────────────────────────
  { key: "im_hero_h1",           label: "Hero Headline",                  page: "Investment Management",
    default: "Investment Management" },
  { key: "im_hero_sub",          label: "Hero Subtext",                   page: "Investment Management",
    default: "A disciplined process that begins with an analysis of your goals and risk tolerance — and stays focused on the long term." },
  { key: "im_lede",              label: "Philosophy Intro",               page: "Investment Management",
    default: "Steadfast uses primarily no-load mutual funds and ETFs selected through rigorous research to identify fund managers with sustainable competitive advantages. Our portfolio allocation strategy combines diversified asset classes suited to each client's timeframe and risk tolerance, grounded in modern portfolio theory principles. We avoid attempts at market timing, but periodically adjust model portfolios tactically when market segments appear meaningfully overvalued or undervalued." },
  { key: "im_invest_h2",         label: "How We Invest — Headline",       page: "Investment Management",
    default: "Disciplined Process,\nPersonalized Portfolios" },
  { key: "im_invest_list",       label: "How We Invest — List (one per line)", page: "Investment Management",
    default: "Goals & risk-tolerance analysis\nDiversified asset allocation\nLong-term perspective\nNo-load mutual funds & ETFs\nRigorous manager research\nModern portfolio theory principles\nPeriodic tactical adjustments\nQuarterly performance reporting\nOnline client access" },
  { key: "im_fees_h2",           label: "Fees — Headline",                page: "Investment Management",
    default: "Transparent,\nTiered Pricing" },
  { key: "im_fees_lead",         label: "Fees — Lead",                    page: "Investment Management",
    default: "Straightforward, asset-based fees that decrease as your portfolio grows — aligned with your long-term success and never tied to product commissions." },
  { key: "im_fees_footnote",     label: "Fees — Reporting Note",          page: "Investment Management",
    default: "Quarterly reports display holdings and performance versus relevant benchmarks. Clients can request reporting on unmanaged assets and online access for frequent investment monitoring." },

  // ── Our People ─────────────────────────────────────────────
  { key: "op_hero_h1",           label: "Hero Headline",                  page: "Our People",
    default: "Our People" },
  { key: "op_hero_sub",          label: "Hero Subtext",                   page: "Our People",
    default: "Advisors who measure success by the relationships they build and the lives they impact." },
  { key: "team_headline",        label: "Team — Headline",                page: "Our People",
    default: "Built By Experience,\nDriven By Service" },
  { key: "team_body",            label: "Team — Body",                    page: "Our People",
    default: "Since 1998, Steadfast has been led by advisors who value deep client relationships, lifelong learning, and the privilege of stewarding other people's resources well." },

  // ── Contact ────────────────────────────────────────────────
  { key: "contact_hero_h1",      label: "Hero Headline",                  page: "Contact",
    default: "Contact Us" },
  { key: "contact_hero_sub",     label: "Hero Subtext",                   page: "Contact",
    default: "We'd love to hear from you. Reach out to start a conversation about your financial goals." },
  { key: "contact_intro_h2",     label: "Intro — Headline",               page: "Contact",
    default: "Let's Start\nThe Conversation" },
  { key: "contact_intro_body",   label: "Intro — Body",                   page: "Contact",
    default: "Whether you have a question about our services, want to schedule a discovery meeting, or simply need a steady sounding board, we're here to help. Expect a personal response — not an auto-reply." },
  { key: "contact_email",        label: "Email Address",                  page: "Contact",
    default: "Matt@steadfastwealth.com" },
  { key: "contact_phone",        label: "Phone Number",                   page: "Contact",
    default: "(407) 786-0092" },
  { key: "contact_fax",          label: "Fax Line",                       page: "Contact",
    default: "Fax: (407) 358-5468" },

  // ── Disclosures ────────────────────────────────────────────
  { key: "disc_hero_h1",         label: "Hero Headline",                  page: "Disclosures",
    default: "Disclosures" },
  { key: "disc_hero_sub",        label: "Hero Subtext",                   page: "Disclosures",
    default: "Disclosure statements and registration information for Steadfast Financial Services." },
  { key: "disc_body",            label: "Disclosure Statements",          page: "Disclosures",
    default: "This website is a publication of Steadfast Financial Services, Inc. The firm is registered as an investment adviser with the state of Florida and only conducts business in states where it is properly registered or is excluded from registration requirements. Registration is not an endorsement of the firm by securities regulators and does not mean the adviser has achieved a specific level of skill or ability. The firm is not engaged in the practice of law.\n\nContent should not be viewed as personalized investment advice. All expressions of opinion reflect the judgment of the authors on the date of publication and may change in response to market conditions. You should consult with a professional advisor before implementing any strategies discussed. Content should not be viewed as an offer to buy or sell any of the securities mentioned or as legal or tax advice. You should always consult an attorney or tax professional regarding your specific legal or tax situation.\n\nHyperlinks on this website are provided as a convenience. We cannot be held responsible for information, services or products found on websites linked to ours.\n\nAll investments have the potential for profit or loss. Different types of investments involve higher and lower levels of risk. There is no guarantee that a specific investment or strategy will be suitable or profitable for an investor's portfolio. There are no assurances that a portfolio will match or exceed any particular benchmark. Asset allocation and diversification will not necessarily improve an investor's returns and cannot eliminate the risk of investment losses." },

  // ── Footer ─────────────────────────────────────────────────
  { key: "footer_left_h",        label: "Left Column — Heading",          page: "Footer",
    default: "Serving since 1998" },
  { key: "footer_left_body",     label: "Left Column — Body",             page: "Footer",
    default: "Fee-Only Financial Planning\n& Investment Advisory" },
  { key: "footer_email",         label: "Center — Email",                 page: "Footer",
    default: "Matt@steadfastwealth.com" },
  { key: "footer_right_h",       label: "Right Column — Heading",         page: "Footer",
    default: "Connect" },
  { key: "footer_phone",         label: "Office Phone",                   page: "Footer",
    default: "(407) 786-0092" },
  { key: "footer_fax",           label: "Fax",                            page: "Footer",
    default: "(407) 358-5468" },
  { key: "footer_brokercheck",   label: "BrokerCheck Line",               page: "Footer",
    default: "Check the background of your financial professional on FINRA's BrokerCheck." },
  { key: "footer_disclaimer",    label: "Disclaimer",                     page: "Footer",
    default: "Steadfast Financial Services is a fee-only registered investment advisor. The content on this site is developed from sources believed to be providing accurate information and is not intended as tax or legal advice. Please consult legal or tax professionals for specific information regarding your individual situation." },
  { key: "footer_copy",          label: "Copyright Prefix",               page: "Footer",
    default: "© Copyright" },
  { key: "footer_copy_suffix",   label: "Copyright Suffix",               page: "Footer",
    default: "Steadfast. All Rights Reserved." },
];

const PAGE_ORDER = ["Home", "Financial Planning", "Investment Management", "Our People", "Contact", "Disclosures", "Footer"];

const contentFields = document.getElementById("contentFields");
const contentSidebar = document.getElementById("contentSidebar");
const contentPreviewFrame = document.getElementById("contentPreviewFrame");
const contentPreviewLabel = document.getElementById("contentPreviewLabel");
const contentPreviewRefresh = document.getElementById("contentPreviewRefresh");
let activeContentPage = PAGE_ORDER[0];

const PAGE_URL = {
  "Home": "/index.html",
  "Financial Planning": "/financial-planning.html",
  "Investment Management": "/investment-management.html",
  "Our People": "/our-people.html",
  "Contact": "/contact-us.html",
  "Disclosures": "/disclosures.html",
  "Footer": "/index.html#footer",
};

function pageSlug(page) {
  return page.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function previewSrcFor(page) {
  const url = PAGE_URL[page] || "/index.html";
  return url + "?preview=1&t=" + Date.now();
}

function currentDraftContent() {
  const draft = {};
  contentFields.querySelectorAll("textarea[data-key]").forEach((ta) => {
    draft[ta.dataset.key] = ta.value;
  });
  return draft;
}

function postDraftToPreview() {
  if (!contentPreviewFrame || !contentPreviewFrame.contentWindow) return;
  try {
    contentPreviewFrame.contentWindow.postMessage(
      { type: "steadfast:preview-content", content: currentDraftContent() },
      "*"
    );
  } catch (e) {}
}

function setContentPreview(page) {
  if (!contentPreviewFrame) return;
  contentPreviewFrame.src = previewSrcFor(page);
  if (contentPreviewLabel) contentPreviewLabel.textContent = "Live preview · " + page;
}

if (contentPreviewRefresh && contentPreviewFrame) {
  contentPreviewRefresh.addEventListener("click", () => setContentPreview(activeContentPage));
}


window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "steadfast:preview-ready") {
    postDraftToPreview();
  }
});

let draftPostTimer = null;
if (contentFields) {
  contentFields.addEventListener("input", (e) => {
    if (!e.target.matches("textarea[data-key]")) return;
    clearTimeout(draftPostTimer);
    draftPostTimer = setTimeout(postDraftToPreview, 200);
  });
}

function renderContentSidebar(activePages) {
  if (!contentSidebar) return;
  contentSidebar.innerHTML = activePages
    .map((page) => {
      const cls = page === activeContentPage ? "content-page-link is-active" : "content-page-link";
      return `<button type="button" class="${cls}" data-page="${escapeHtml(page)}">${escapeHtml(page)}</button>`;
    })
    .join("");
  contentSidebar.querySelectorAll(".content-page-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeContentPage = btn.dataset.page;
      contentSidebar.querySelectorAll(".content-page-link").forEach((b) => {
        b.classList.toggle("is-active", b.dataset.page === activeContentPage);
      });
      contentFields.querySelectorAll(".content-page-group").forEach((sec) => {
        sec.classList.toggle("is-visible", sec.dataset.page === activeContentPage);
      });
      setContentPreview(activeContentPage);
    });
  });
}

async function loadContent() {
  const { data, error } = await supabase.from("site_content").select("key, value");
  if (error) return toast("Load failed: " + error.message, "error");
  const map = Object.fromEntries((data || []).map((r) => [r.key, r.value]));

  const byPage = CONTENT_KEYS.reduce((acc, k) => {
    (acc[k.page] = acc[k.page] || []).push(k);
    return acc;
  }, {});

  const activePages = PAGE_ORDER.filter((page) => byPage[page] && byPage[page].length);
  if (!activePages.includes(activeContentPage)) activeContentPage = activePages[0];

  contentFields.innerHTML = activePages
    .map((page) => {
      const fields = byPage[page]
        .map((k) => {
          const value = map[k.key] != null && map[k.key] !== "" ? map[k.key] : (k.default || "");
          const rows = Math.max(2, Math.min(8, Math.ceil((value || "").length / 90) + 1));
          return `
            <div class="content-field">
              <label>${escapeHtml(k.label)}</label>
              <textarea data-key="${k.key}" rows="${rows}">${escapeHtml(value)}</textarea>
            </div>`;
        })
        .join("");
      const visibleCls = page === activeContentPage ? " is-visible" : "";
      return `
        <section class="content-page-group${visibleCls}" data-page="${escapeHtml(page)}">
          <h3 class="content-page-title">${escapeHtml(page)}</h3>
          <div class="content-page-fields">${fields}</div>
        </section>`;
    })
    .join("");

  renderContentSidebar(activePages);
  setContentPreview(activeContentPage);
}

document.getElementById("btnSaveContent").addEventListener("click", async () => {
  const rows = [];
  contentFields.querySelectorAll("textarea").forEach((ta) => {
    rows.push({ key: ta.dataset.key, value: ta.value });
  });
  const { error } = await supabase.from("site_content").upsert(rows, { onConflict: "key" });
  if (error) return toast("Save failed: " + error.message, "error");
  toast("Content saved");
  setContentPreview(activeContentPage);
});

// ═══════════════════════════════════════════════════════════════
//  MESSAGES — contact form submissions
// ═══════════════════════════════════════════════════════════════
const messagesList = document.getElementById("messagesList");
const btnRefreshMessages = document.getElementById("btnRefreshMessages");

async function loadMessages() {
  if (!messagesList) return;
  messagesList.innerHTML = '<p style="color:#5c6a63;padding:12px;">Loading messages…</p>';
  const { data, error } = await supabase
    .from("contact_submissions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    messagesList.innerHTML = '<p class="status-msg error" style="padding:12px;">Could not load messages: ' + escapeHtml(error.message) + '</p>';
    return;
  }
  if (!data || !data.length) {
    messagesList.innerHTML = '<p style="color:#5c6a63;padding:12px;">No messages yet.</p>';
    return;
  }
  messagesList.innerHTML = data
    .map((m) => {
      const when = m.created_at ? new Date(m.created_at).toLocaleString() : "";
      const phone = m.phone ? ' · <a href="tel:' + escapeHtml(m.phone) + '">' + escapeHtml(m.phone) + "</a>" : "";
      const source = m.source ? '<span class="msg-source">' + escapeHtml(m.source) + "</span>" : "";
      return `
        <article class="message-card">
          <header class="message-card-head">
            <div>
              <strong>${escapeHtml(m.name || "—")}</strong>
              ${source}
            </div>
            <time>${escapeHtml(when)}</time>
          </header>
          <div class="message-card-meta">
            <a href="mailto:${escapeHtml(m.email || "")}">${escapeHtml(m.email || "")}</a>${phone}
          </div>
          <p class="message-card-body">${escapeHtml(m.message || "")}</p>
        </article>`;
    })
    .join("");
}

if (btnRefreshMessages) btnRefreshMessages.addEventListener("click", loadMessages);

// ═══════════════════════════════════════════════════════════════
//  CLIENT LINKS — group/label/sublabel/url, reorderable
// ═══════════════════════════════════════════════════════════════
const DEFAULT_CLIENT_LINKS = [
  { group: "Client Resources", label: "Investor Access",  sublabel: "Access your Raymond James account",  url: "https://clientaccess.rjf.com/" },
  { group: "Client Resources", label: "eMoneyAdvisor",    sublabel: "Access to your financial plan",       url: "https://wealth.emaplan.com/" },
  { group: "Financial Interest", label: "Crown Ministries", sublabel: "Biblically-based financial stewardship", url: "https://www.crown.org/" },
  { group: "Steadfast Disclosures", label: "Disclosures", sublabel: "Disclosure statements and ADV filings", url: "#disclosures" },
];

let clientLinks = [];

const linksEditor = document.getElementById("linksEditor");

function renderClientLinks() {
  if (!linksEditor) return;
  if (!clientLinks.length) {
    linksEditor.innerHTML = '<p style="color:#5c6a63;padding:16px;">No links yet. Click "+ Add Link" to create one.</p>';
    return;
  }
  linksEditor.innerHTML = clientLinks
    .map(
      (l, i) => `
        <div class="link-card" data-index="${i}">
          <div class="link-card-fields">
            <label>Group <input type="text" data-field="group" value="${escapeHtml(l.group || "")}" placeholder="e.g. Client Resources" /></label>
            <label>Label <input type="text" data-field="label" value="${escapeHtml(l.label || "")}" /></label>
            <label>Sublabel <input type="text" data-field="sublabel" value="${escapeHtml(l.sublabel || "")}" placeholder="Short description" /></label>
            <label>URL <input type="text" data-field="url" value="${escapeHtml(l.url || "")}" placeholder="https://..." /></label>
          </div>
          <div class="link-card-actions">
            <button type="button" class="btn-admin" data-action="up" title="Move up" ${i === 0 ? "disabled" : ""}>↑</button>
            <button type="button" class="btn-admin" data-action="down" title="Move down" ${i === clientLinks.length - 1 ? "disabled" : ""}>↓</button>
            <button type="button" class="btn-admin btn-danger" data-action="delete" title="Remove">Delete</button>
          </div>
        </div>`
    )
    .join("");
}

if (linksEditor) {
  linksEditor.addEventListener("input", (e) => {
    const card = e.target.closest(".link-card");
    if (!card) return;
    const i = Number(card.dataset.index);
    const field = e.target.dataset.field;
    if (!field || isNaN(i) || !clientLinks[i]) return;
    clientLinks[i][field] = e.target.value;
  });
  linksEditor.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const card = btn.closest(".link-card");
    const i = Number(card.dataset.index);
    if (isNaN(i)) return;
    const action = btn.dataset.action;
    if (action === "up" && i > 0) {
      [clientLinks[i - 1], clientLinks[i]] = [clientLinks[i], clientLinks[i - 1]];
    } else if (action === "down" && i < clientLinks.length - 1) {
      [clientLinks[i + 1], clientLinks[i]] = [clientLinks[i], clientLinks[i + 1]];
    } else if (action === "delete") {
      if (!confirm("Remove this link?")) return;
      clientLinks.splice(i, 1);
    } else {
      return;
    }
    renderClientLinks();
  });
}

const btnAddLink = document.getElementById("btnAddLink");
if (btnAddLink) {
  btnAddLink.addEventListener("click", () => {
    clientLinks.push({ group: "Client Resources", label: "", sublabel: "", url: "" });
    renderClientLinks();
  });
}

const btnSaveLinks = document.getElementById("btnSaveLinks");
if (btnSaveLinks) {
  btnSaveLinks.addEventListener("click", async () => {
    const value = JSON.stringify(clientLinks);
    const { error } = await supabase
      .from("site_content")
      .upsert([{ key: "client_links", value }], { onConflict: "key" });
    if (error) return toast("Save failed: " + error.message, "error");
    toast("Client links saved");
  });
}

async function loadClientLinks() {
  const { data, error } = await supabase
    .from("site_content")
    .select("value")
    .eq("key", "client_links")
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    toast("Load failed: " + error.message, "error");
  }
  let parsed = null;
  if (data && data.value) {
    try { parsed = JSON.parse(data.value); } catch (e) {}
  }
  clientLinks = Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_CLIENT_LINKS.map((l) => ({ ...l }));
  renderClientLinks();
}

// ═══════════════════════════════════════════════════════════════
//  IMAGES — inventory + upload
//  Uploads go to the Supabase 'site-images' bucket. Image overrides
//  map an original HTML reference to the public URL of the upload.
// ═══════════════════════════════════════════════════════════════
const inventoryEl = document.getElementById("imagesInventory");
const refreshBtn = document.getElementById("btnRefreshImages");
if (refreshBtn) refreshBtn.addEventListener("click", loadImagesInventory);

async function loadImagesInventory() {
  if (!inventoryEl) return;
  inventoryEl.innerHTML = '<p style="color:#5c6a63;padding:20px;">Loading image inventory…</p>';
  try {
    const res = await fetch("/api/images/inventory");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const { data: overrideRows } = await supabase.from("image_overrides").select("*");
    const overrides = Object.fromEntries((overrideRows || []).map((r) => [r.original, r.replacement]));

    const pages = data.pages || [];
    if (!pages.length) {
      inventoryEl.innerHTML = '<p style="color:#5c6a63;padding:20px;">No images found.</p>';
      return;
    }
    inventoryEl.innerHTML = pages
      .map((p) => {
        if (!p.images.length) return "";
        const cards = p.images
          .map((img) => {
            const over = overrides[img.src];
            const effective = over || "/" + img.src;
            const kindBadge = '<span class="img-kind">' + escapeHtml(img.kind) + "</span>";
            const overrideNotice = over
              ? '<div class="img-override">Overridden → ' + escapeHtml(over) + "</div>"
              : "";
            const revertBtn = over
              ? '<button class="btn-admin btn-danger" data-revert="' + escapeHtml(img.src) + '">Revert</button>'
              : "";
            return (
              '<div class="image-card">' +
                '<div class="image-thumb" style="background-image:url(\'' + effective + "?t=" + Date.now() + "')\"></div>" +
                '<div class="image-meta">' +
                  kindBadge +
                  '<div class="img-src" title="' + escapeHtml(img.src) + '">' + escapeHtml(img.src) + "</div>" +
                  (img.alt ? '<div class="img-alt">' + escapeHtml(img.alt) + "</div>" : "") +
                  overrideNotice +
                "</div>" +
                '<div class="image-actions">' +
                  '<label class="btn-admin btn-primary">Replace' +
                    '<input type="file" accept="image/*" data-replace="' + escapeHtml(img.src) + '" style="display:none" />' +
                  "</label>" +
                  revertBtn +
                "</div>" +
              "</div>"
            );
          })
          .join("");
        return (
          '<div class="image-page-group">' +
            '<h3 class="image-page-title">' + escapeHtml(p.label) + ' <span class="image-page-file">' + escapeHtml(p.file) + "</span></h3>" +
            '<div class="image-grid">' + cards + "</div>" +
          "</div>"
        );
      })
      .join("");

    inventoryEl.querySelectorAll("input[data-replace]").forEach((input) => {
      input.addEventListener("change", async (e) => {
        const original = input.getAttribute("data-replace");
        const file = e.target.files[0];
        if (!file) return;
        input.disabled = true;
        try {
          const ext = file.name.split(".").pop();
          const safeName = original.replace(/[^a-z0-9]/gi, "-").toLowerCase();
          const objectPath = `replacements/${safeName}-${Date.now()}.${ext}`;
          const up = await supabase.storage.from("site-images").upload(objectPath, file, {
            upsert: false,
            contentType: file.type,
          });
          if (up.error) throw up.error;
          const { data: pub } = supabase.storage.from("site-images").getPublicUrl(objectPath);
          const { error } = await supabase
            .from("image_overrides")
            .upsert({ original, replacement: pub.publicUrl }, { onConflict: "original" });
          if (error) throw error;
          toast("Image replaced");
          loadImagesInventory();
        } catch (err) {
          toast("Replace failed: " + (err.message || err), "error");
          input.disabled = false;
        }
      });
    });

    inventoryEl.querySelectorAll("button[data-revert]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Restore the original image?")) return;
        const original = btn.getAttribute("data-revert");
        const { error } = await supabase.from("image_overrides").delete().eq("original", original);
        if (error) return toast("Revert failed: " + error.message, "error");
        toast("Reverted");
        loadImagesInventory();
      });
    });
  } catch (err) {
    inventoryEl.innerHTML =
      '<p style="color:#a03;padding:20px;">Inventory scan requires the local dev server (run <code>node server.js</code>) — or deploy this route as a serverless function.</p>';
  }
}

const uploadForm = document.getElementById("uploadForm");
const uploadResult = document.getElementById("uploadResult");

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const file = document.getElementById("uploadFile").files[0];
  if (!file) return alert("Choose a file first.");
  const dir = document.getElementById("uploadDir").value === "team" ? "team" : "general";
  try {
    const ext = file.name.split(".").pop();
    const safe = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-_]/gi, "-").toLowerCase();
    const path = `${dir}/${safe}-${Date.now()}.${ext}`;
    const up = await supabase.storage.from("site-images").upload(path, file, { contentType: file.type });
    if (up.error) throw up.error;
    const { data: pub } = supabase.storage.from("site-images").getPublicUrl(path);
    uploadResult.innerHTML = 'Uploaded: <a href="' + pub.publicUrl + '" target="_blank">' + pub.publicUrl + "</a>";
    uploadResult.classList.add("show");
  } catch (err) {
    uploadResult.textContent = "Upload failed: " + (err.message || err);
    uploadResult.classList.add("show");
  }
});

// ═══════════════════════════════════════════════════════════════
//  COMPLIANCE
//  Screenshots are produced by the /api/compliance/screenshot Vercel
//  function (Puppeteer + @sparticuz/chromium). Both screenshots and
//  approval uploads live in private Supabase Storage buckets; signed
//  URLs are generated client-side for viewing.
// ═══════════════════════════════════════════════════════════════
const SCREENSHOTS_BUCKET = "compliance-screenshots";
const APPROVALS_BUCKET = "compliance-approvals";
const SIGNED_URL_TTL = 60 * 60; // 1 hour

async function listBucketRecursively(bucket, prefix = "") {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) throw error;
  const files = [];
  for (const entry of data || []) {
    // Folders in Supabase Storage return with id === null.
    if (entry.id === null) {
      const sub = await listBucketRecursively(bucket, prefix ? `${prefix}/${entry.name}` : entry.name);
      files.push(...sub);
    } else {
      files.push({
        name: entry.name,
        path: prefix ? `${prefix}/${entry.name}` : entry.name,
        created_at: entry.created_at,
      });
    }
  }
  return files;
}

async function renderArchive(bucket, elId, emptyMsg) {
  const el = document.getElementById(elId);
  if (!el) return;
  try {
    const files = await listBucketRecursively(bucket);
    if (!files.length) {
      el.innerHTML = '<p style="color:#5c6a63;padding:12px;">' + emptyMsg + "</p>";
      return;
    }
    files.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const paths = files.map((f) => f.path);
    const { data: signed, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls(paths, SIGNED_URL_TTL);
    if (error) throw error;
    const urls = Object.fromEntries((signed || []).map((s) => [s.path, s.signedUrl]));
    el.innerHTML = files
      .map((f) => {
        const when = f.created_at ? new Date(f.created_at).toLocaleString() : "";
        const href = urls[f.path] || "#";
        return (
          '<div class="archive-item">' +
            '<a href="' + href + '" target="_blank" rel="noopener">' + escapeHtml(f.name) + "</a>" +
            '<span class="archive-date">' + when + "</span>" +
          "</div>"
        );
      })
      .join("");
  } catch (err) {
    el.innerHTML =
      '<p style="color:#a03;padding:12px;">Could not load ' + escapeHtml(bucket) +
      ": " + escapeHtml(err.message || String(err)) + "</p>";
  }
}

const ACTION_LABELS = {
  publish: "Published changes to live site",
  approval_uploaded: "Compliance approval uploaded",
  screenshot_captured: "Screenshot captured",
  content_saved: "Site content updated",
};

const FILE_LABELS = {
  "data/articles.json": "Articles",
  "data/team.json": "Team",
  "data/content.json": "Site Content",
  "data/image-overrides.json": "Image Overrides",
};

function actionLabel(action) {
  if (!action) return "Update";
  return ACTION_LABELS[action] || action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatLogDetail(detail) {
  if (!detail || typeof detail !== "object") return "";
  const parts = [];
  if (detail.by) {
    parts.push(`<span class="log-meta-item"><span class="log-meta-label">By</span> ${escapeHtml(detail.by)}</span>`);
  }
  if (Array.isArray(detail.files) && detail.files.length) {
    const names = detail.files.map((f) => FILE_LABELS[f] || f.replace(/^data\//, "").replace(/\.json$/, ""));
    parts.push(
      `<span class="log-meta-item"><span class="log-meta-label">Sections</span> ${names.map(escapeHtml).join(", ")}</span>`
    );
  }
  if (detail.original_name) {
    parts.push(`<span class="log-meta-item"><span class="log-meta-label">File</span> ${escapeHtml(detail.original_name)}</span>`);
  }
  if (detail.page) {
    parts.push(`<span class="log-meta-item"><span class="log-meta-label">Page</span> ${escapeHtml(detail.page)}</span>`);
  }
  if (detail.note) {
    parts.push(`<span class="log-meta-item log-meta-note">${escapeHtml(detail.note)}</span>`);
  }
  if (detail.commit) {
    const shortSha = String(detail.commit).slice(0, 7);
    parts.push(
      `<span class="log-meta-item log-meta-commit" title="${escapeHtml(detail.commit)}"><span class="log-meta-label">Revision</span> ${escapeHtml(shortSha)}</span>`
    );
  }
  return parts.join("");
}

function formatLogTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return escapeHtml(String(ts));
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function loadCompliance() {
  const { data: log } = await supabase
    .from("compliance_log")
    .select("*")
    .order("timestamp", { ascending: false })
    .limit(100);
  const logEl = document.getElementById("complianceLog");
  if (logEl) {
    if (!log || !log.length) {
      logEl.innerHTML = '<p style="color:#5c6a63;padding:16px;">No changes logged yet.</p>';
    } else {
      logEl.innerHTML = log
        .map((entry) => {
          const meta = formatLogDetail(entry.detail);
          return `
            <article class="log-row">
              <header class="log-row-head">
                <span class="log-action">${escapeHtml(actionLabel(entry.action))}</span>
                <time class="log-time">${escapeHtml(formatLogTime(entry.timestamp))}</time>
              </header>
              ${meta ? `<div class="log-meta">${meta}</div>` : ""}
            </article>`;
        })
        .join("");
    }
  }
  await Promise.all([
    renderArchive(SCREENSHOTS_BUCKET, "screenshotsList", "No screenshots yet."),
    renderArchive(APPROVALS_BUCKET, "approvalsList", "No approval documents uploaded."),
  ]);
}

const screenshotBtn = document.getElementById("btnScreenshot");
if (screenshotBtn) {
  screenshotBtn.addEventListener("click", async () => {
    const status = document.getElementById("screenshotStatus");
    status.textContent = "Capturing every page… this takes about a minute.";
    status.className = "status-msg";
    screenshotBtn.disabled = true;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not signed in.");
      const r = await fetch("/api/compliance/screenshot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({}),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "HTTP " + r.status);
      const lines = (data.captures || []).map((c) => {
        if (c.ok) {
          return '<li><a href="' + c.signedUrl + '" target="_blank" rel="noopener">' +
            escapeHtml(c.page) + "</a></li>";
        }
        return '<li class="status-msg error">' + escapeHtml(c.page) + " — " +
          escapeHtml(c.error || "failed") + "</li>";
      }).join("");
      status.innerHTML =
        "Captured " + data.okCount + " of " + (data.okCount + data.failCount) +
        " pages.<ul class=\"capture-list\">" + lines + "</ul>";
      loadCompliance();
    } catch (err) {
      status.textContent = "Failed: " + (err.message || err);
      status.className = "status-msg error";
    } finally {
      screenshotBtn.disabled = false;
    }
  });
}

const approvalForm = document.getElementById("approvalForm");
if (approvalForm) {
  approvalForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = document.getElementById("approvalFile").files[0];
    if (!file) return alert("Choose a file.");
    const note = document.getElementById("approvalNote").value || "";
    const status = document.getElementById("approvalStatus");
    status.textContent = "Uploading…";
    status.className = "status-msg";
    try {
      const now = new Date();
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const safe = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-_]/gi, "-").toLowerCase();
      const objectPath =
        now.getUTCFullYear() + "/" +
        String(now.getUTCMonth() + 1).padStart(2, "0") + "/" +
        "approval-" + safe + "-" + now.getTime() + "." + ext;
      const up = await supabase.storage.from(APPROVALS_BUCKET).upload(objectPath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (up.error) throw up.error;
      await supabase.from("compliance_log").insert({
        action: "approval_uploaded",
        detail: { path: objectPath, original_name: file.name, note },
      });
      status.textContent = "Uploaded: " + file.name;
      approvalForm.reset();
      loadCompliance();
    } catch (err) {
      status.textContent = "Failed: " + (err.message || err);
      status.className = "status-msg error";
    }
  });
}

// ═══════════════════════════════════════════════════════════════
//  PUBLISH
//  Calls /api/publish — a serverless function that reads Supabase
//  and commits data/*.json to the repo so Vercel redeploys.
// ═══════════════════════════════════════════════════════════════
async function publish() {
  const btn = document.getElementById("btnPublish");
  const label = document.getElementById("publishLabel");
  btn.disabled = true;
  label.textContent = "Publishing…";
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("Not signed in.");
    const r = await fetch("/api/publish", {
      method: "POST",
      headers: { Authorization: "Bearer " + accessToken },
    });
    const raw = await r.text();
    let result = {};
    try { result = JSON.parse(raw); } catch {}
    if (!r.ok) {
      console.error("[publish] HTTP", r.status, r.statusText, "\ncontent-type:", r.headers.get("content-type"), "\nbody:", raw);
      const detail = result.error || raw.slice(0, 300) || r.statusText;
      throw new Error("HTTP " + r.status + " — " + detail);
    }
    toast("Published! Site will update shortly.", "success");
    label.textContent = "Publish";
  } catch (err) {
    console.error("[publish]", err);
    toast("Publish failed: " + err.message, "error");
    label.textContent = "Publish";
  } finally {
    btn.disabled = false;
  }
}

// ── Initial load ───────────────────────────────────────────────
loadArticles();
