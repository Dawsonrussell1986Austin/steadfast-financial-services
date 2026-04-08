# Steadfast Financial Services

Marketing website for **Steadfast Financial Services** — a fee-only financial planning and investment advisory firm in Altamonte Springs, FL, serving families since 1998.

Design inspired by Black Creek Wealth Management, rebuilt around Steadfast's lighthouse brand with a forest-green and cream palette.

## ✨ Features

- **Video hero** with a sunset lighthouse clip (autoplay / muted / loop)
- **Five fully built pages**: Home, Financial Planning, Investment Management, Our People, Links, Contact Us
- **Shared header & footer** injected via a single JS partial so every page stays in sync
- **Smooth cross-document page transitions** via the View Transitions API (with a CSS fade fallback for older browsers)
- **Responsive layout** down to mobile (slide-down nav, stacked grids)
- **Accessible markup**: semantic sections, ARIA labels, proper heading hierarchy
- **Fast & dependency-free**: plain HTML / CSS / vanilla JS — no build step, no framework

## 📁 Project structure

```
.
├── index.html                  # Home
├── financial-planning.html
├── investment-management.html
├── our-people.html
├── links.html
├── contact-us.html
├── styles.css                  # Shared stylesheet
├── assets/
│   ├── logo.png                # Full color raster logo
│   ├── logo-white.svg          # White logo for dark header
│   ├── logo-dark.svg           # Dark green logo for scrolled/footer
│   ├── partials.js             # Header, footer, transitions, scroll state
│   └── video/
│       ├── hero-lighthouse.mp4
│       └── hero-lighthouse-poster.png
└── .claude/
    └── launch.json             # Dev server configurations
```

## 🚀 Run locally

This is a static site — any file server works. Three ready-to-go options live in `.claude/launch.json`:

```bash
# Python (no install required)
python3 -m http.server 5173

# Or with Node
npx http-server . -p 5174 -c-1

# Or with Vercel serve
npx serve . -l 5175
```

Then open <http://localhost:5173/> in your browser.

## 🎨 Brand

- **Primary**: `#0b3a2a` (green-900)
- **Accent**: `#c39a55` (gold)
- **Background**: `#f5efdc` (cream) / `#faf6e8` (cream-soft)
- **Serif display**: Cormorant Garamond
- **Sans body**: Inter

## 🧪 Credits

- Hero lighthouse video: [Mixkit #16017 — "Lighthouse at sunset"](https://mixkit.co/free-stock-video/lighthouse/) (free commercial license)
- Photography: [Unsplash](https://unsplash.com) (free to use)

## 📄 License

© Steadfast Financial Services. All rights reserved.
