/* Shared header + footer partials injected into every page */
(function () {
  const CURRENT = (() => {
    const p = location.pathname.toLowerCase();
    if (p.endsWith("/financial-planning.html") || p.includes("financial-planning")) return "financial-planning";
    if (p.endsWith("/investment-management.html") || p.includes("investment-management")) return "investment-management";
    if (p.endsWith("/our-people.html") || p.includes("our-people")) return "our-people";
    if (p.endsWith("/resources.html") || p.includes("resources")) return "resources";
    if (p.endsWith("/links.html") || p.includes("links")) return "links";
    if (p.endsWith("/contact-us.html") || p.includes("contact-us")) return "contact-us";
    return "home";
  })();

  const NAV_ITEMS = [
    { href: "financial-planning.html", label: "Financial Planning", key: "financial-planning" },
    { href: "investment-management.html", label: "Investment Management", key: "investment-management" },
    { href: "our-people.html", label: "Our People", key: "our-people" },
    { href: "resources.html", label: "Resources", key: "resources" },
  ];

  const base = document.body.getAttribute("data-base") || "";

  const navLinks = NAV_ITEMS.map(
    (it) =>
      `<li><a href="${base}${it.href}"${it.key === CURRENT ? ' class="is-active"' : ""}>${it.label}</a></li>`
  ).join("");

  const headerHTML = `
  <header class="site-header" id="siteHeader">
    <div class="nav-container">
      <a href="${base}index.html" class="brand" aria-label="Steadfast Financial Services home">
        <img src="${base}assets/logo-white.svg" alt="Steadfast Financial Services" class="brand-logo brand-logo-light" />
        <img src="${base}assets/logo-dark.svg" alt="" aria-hidden="true" class="brand-logo brand-logo-dark" />
      </a>
      <nav class="primary-nav" aria-label="Primary">
        <ul>${navLinks}</ul>
      </nav>
      <div class="nav-cta">
        <a href="https://clientaccess.rjf.com/" target="_blank" rel="noopener" class="link-muted">Client Login</a>
        <a href="${base}contact-us.html" class="btn btn-primary">Contact Us <span aria-hidden="true">+</span></a>
        <button class="nav-toggle" id="navToggle" aria-label="Toggle navigation" aria-expanded="false">
          <span></span><span></span><span></span>
        </button>
      </div>
    </div>
  </header>`;

  const footerHTML = `
  <footer class="site-footer">
    <div class="footer-accent"></div>
    <div class="container footer-grid">
      <div class="footer-col">
        <h4>Serving Central Florida &amp; Beyond</h4>
        <p><strong>Fee-Only Financial Planning</strong><br /><strong>&amp; Investment Advisory</strong></p>
      </div>
      <div class="footer-col footer-brand">
        <img src="${base}assets/logo-dark.svg" alt="Steadfast Financial Services" />
        <a href="mailto:Matt@steadfastwealth.com"><strong>Matt@steadfastwealth.com</strong></a>
      </div>
      <div class="footer-col footer-right">
        <h4>Connect</h4>
        <p>Office: <a href="tel:14077860092"><strong>(407) 786-0092</strong></a><br/>Fax: <strong>(407) 358-5468</strong></p>
      </div>
    </div>
    <div class="container footer-fine">
      <p>Check the background of your financial professional on FINRA's BrokerCheck.</p>
      <p class="fine-print">
        Steadfast Financial Services is a fee-only registered investment advisor. The content on this
        site is developed from sources believed to be providing accurate information and is not
        intended as tax or legal advice. Please consult legal or tax professionals for specific
        information regarding your individual situation.
      </p>
      <p class="copy">© Copyright <span id="year"></span> Steadfast. All Rights Reserved.</p>
    </div>
  </footer>`;

  // Inject
  const headerMount = document.getElementById("site-header-mount");
  const footerMount = document.getElementById("site-footer-mount");
  if (headerMount) headerMount.outerHTML = headerHTML;
  if (footerMount) footerMount.outerHTML = footerHTML;

  // Header scroll state
  const header = document.getElementById("siteHeader");
  const setHeaderState = () => {
    if (!header) return;
    if (window.scrollY > 40) header.classList.add("is-scrolled");
    else header.classList.remove("is-scrolled");
  };
  window.addEventListener("scroll", setHeaderState, { passive: true });
  setHeaderState();

  // Mobile nav toggle
  const toggle = document.getElementById("navToggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const nav = document.querySelector(".primary-nav");
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      if (nav) nav.classList.toggle("is-open");
      document.body.classList.toggle("nav-open", !expanded);
    });
  }

  // Year
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Reveal animations
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("in-view");
          io.unobserve(e.target);
        }
      }
    },
    { threshold: 0.12 }
  );
  document.querySelectorAll(".section, .service-card, .value, .team-card").forEach((el) => io.observe(el));

  // -------- Smooth page transitions (fallback for non-View-Transition browsers) --------
  const sameOriginInternal = (a) => {
    if (!a || !a.href) return false;
    try {
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin) return false;
      if (a.target && a.target !== "_self") return false;
      if (a.hasAttribute("download")) return false;
      if (u.pathname === location.pathname && u.search === location.search && u.hash) return false; // in-page anchor
      // Only transition for .html pages we own
      return /\.html?$/.test(u.pathname) || u.pathname === "/" || u.pathname.endsWith("/");
    } catch {
      return false;
    }
  };

  const supportsViewTransitions = typeof document.startViewTransition === "function";

  document.addEventListener("click", (e) => {
    // Respect modifier keys and middle-click
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || !sameOriginInternal(a)) return;
    // Let the View Transitions API handle it natively if supported.
    if (supportsViewTransitions) return;
    // Fallback: CSS fade-out then navigate
    e.preventDefault();
    document.body.classList.add("is-leaving");
    setTimeout(() => {
      window.location.href = a.href;
    }, 320);
  });

  // When returning via bfcache, re-trigger fade-in
  window.addEventListener("pageshow", (ev) => {
    if (ev.persisted) {
      document.body.classList.remove("is-leaving");
      document.body.style.animation = "none";
      // force reflow
      void document.body.offsetWidth;
      document.body.style.animation = "";
    }
  });
})();
