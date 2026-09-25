/* Slovak Dance Theatre — statický generátor.
   Bez závislostí. Číta data/*.json, zapisuje dist/.
   Spustenie:  node build.mjs          (Cloudflare Pages: build command = node build.mjs, output = dist) */

import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const DIST = path.join(ROOT, "dist");

const siteRaw = JSON.parse(await readFile(path.join(ROOT, "data/site.json"), "utf8"));
const dataRaw = JSON.parse(await readFile(path.join(ROOT, "data/events.json"), "utf8"));
const UI = JSON.parse(await readFile(path.join(ROOT, "data/ui.json"), "utf8"));

/* ---------- jazyky ----------
   Každý text v dátach môže byť buď obyčajný reťazec, alebo { "sk": …, "en": … }.
   Pred buildom jazyka sa celé dáta „rozbalia“ na daný jazyk, takže stránky
   pracujú s obyčajnými reťazcami. Prvý jazyk v zozname ide na koreň domény. */
const LANGS = siteRaw.languages || ["sk", "en"];
const DEFAULT_LANG = LANGS[0];
let lang = DEFAULT_LANG;

const isLoc = (v) =>
  v && typeof v === "object" && !Array.isArray(v) &&
  Object.keys(v).length > 0 && Object.keys(v).every((k) => LANGS.includes(k));

function loc(v) {
  if (isLoc(v)) return loc(v[lang] ?? v[DEFAULT_LANG] ?? Object.values(v)[0]);
  if (Array.isArray(v)) return v.map(loc);
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = loc(x);
    return o;
  }
  return v;
}
/** text rozhrania z data/ui.json */
const t = (key) => {
  const v = UI[key];
  if (v === undefined) throw new Error(`Chýba text rozhrania: ${key}`);
  return loc(v);
};
/** cesta s prefixom jazyka: /calendar/ → /en/calendar/ */
const L = (p, lg = lang) => (lg === DEFAULT_LANG ? p : `/${lg}${p}`);

let site, data, productions, bySlug;
function useLang(lg) {
  lang = lg;
  site = loc(siteRaw);
  data = loc(dataRaw);
  productions = data.productions;
  bySlug = Object.fromEntries(productions.map((p) => [p.slug, p]));
}
useLang(DEFAULT_LANG);

/* ---------- helpers ---------- */
const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
/** „So 14. nov“ / „Sat 14 Nov“ */
const fmtShort = (dt) =>
  `${t("days")[dt.getUTCDay()]} ${dt.getUTCDate()}${t("dayDot")} ${t("monthsShort")[dt.getUTCMonth()]}`;
/** „SO 14. NOV“ / „SAT 14 NOV“ */
const fmtCaps = (dt) => fmtShort(dt).toUpperCase();

function parseDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
const monthKey = (iso) => iso.slice(0, 7);
const monthName = (key) => {
  const [y, m] = key.split("-").map(Number);
  return `${cap(t("months")[m - 1])} ${y}`;
};

/** Termíny od dneška ďalej, zoradené. */
function upcoming(slug) {
  const today = new Date().toISOString().slice(0, 10);
  return data.performances
    .filter((p) => p.date >= today && (!slug || p.production === slug))
    .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));
}

const stars = (n = 5) => "★".repeat(n);

/* ---------- ikony ---------- */
const ICON = {
  facebook: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><rect x="3.4" y="3.4" width="17.2" height="17.2" rx="4.6" stroke="currentColor" stroke-width="1.5"/><path d="M13.45 19.4v-5.55h1.86l.28-2.16h-2.14V10.3c0-.62.17-1.05 1.07-1.05h1.14V7.32c-.2-.03-.88-.09-1.67-.09-1.65 0-2.78 1.01-2.78 2.86v1.6H9.34v2.16h1.87v5.55" fill="currentColor"/></svg>`,
  instagram: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><rect x="3.4" y="3.4" width="17.2" height="17.2" rx="4.6" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="3.9" stroke="currentColor" stroke-width="1.5"/><circle cx="16.85" cy="7.15" r="1.15" fill="currentColor"/></svg>`,
  _instagram_old: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c2.7 0 3 0 4.1.1 1.1 0 1.8.2 2.4.5.7.2 1.2.6 1.7 1.1s.9 1 1.1 1.7c.3.6.5 1.3.5 2.4.1 1.1.1 1.4.1 4.1s0 3-.1 4.1c0 1.1-.2 1.8-.5 2.4a4.7 4.7 0 0 1-1.1 1.7c-.5.5-1 .9-1.7 1.1-.6.3-1.3.5-2.4.5-1.1.1-1.4.1-4.1.1s-3 0-4.1-.1c-1.1 0-1.8-.2-2.4-.5a4.7 4.7 0 0 1-1.7-1.1 4.7 4.7 0 0 1-1.1-1.7c-.3-.6-.5-1.3-.5-2.4C2 15 2 14.7 2 12s0-3 .1-4.1c0-1.1.2-1.8.5-2.4A4.7 4.7 0 0 1 3.7 3.7c.5-.5 1-.9 1.7-1.1.6-.3 1.3-.5 2.4-.5C9 2 9.3 2 12 2Zm0 1.8c-2.7 0-3 0-4 .1-.9 0-1.4.2-1.7.3-.4.2-.7.4-1 .7-.3.3-.5.6-.7 1-.1.3-.3.8-.3 1.7-.1 1-.1 1.3-.1 4s0 3 .1 4c0 .9.2 1.4.3 1.7.2.4.4.7.7 1 .3.3.6.5 1 .7.3.1.8.3 1.7.3 1 .1 1.3.1 4 .1s3 0 4-.1c.9 0 1.4-.2 1.7-.3.4-.2.7-.4 1-.7.3-.3.5-.6.7-1 .1-.3.3-.8.3-1.7.1-1 .1-1.3.1-4s0-3-.1-4c0-.9-.2-1.4-.3-1.7a2.9 2.9 0 0 0-.7-1 2.9 2.9 0 0 0-1-.7c-.3-.1-.8-.3-1.7-.3-1-.1-1.3-.1-4-.1Zm0 3.1a5.1 5.1 0 1 1 0 10.2 5.1 5.1 0 0 1 0-10.2Zm0 1.8a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6Zm5.3-3.2a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke-linecap="round"/></svg>`,
  left: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  right: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>`,
  close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/></svg>`,
  play: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6L19 12 8 5.2Z" fill="currentColor"/></svg>`,
  cal: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><rect x="3.5" y="5" width="17" height="15.5" stroke="currentColor" stroke-width="1.5"/><path d="M3.5 9.6h17M8 3.4v3.4M16 3.4v3.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
};

/* ---------- spoločné bloky ---------- */
/* ---------- spoločné bloky ---------- */
function ticker(extra = "") {
  const group = (hidden) =>
    `<div class="ticker-group"${hidden ? ' aria-hidden="true"' : ""}>${site.cities
      .map((c) => `<span>${esc(c)}</span>`)
      .join("")}</div>`;
  return `<div class="ticker${extra ? " " + extra : ""}"${extra ? ' aria-hidden="true"' : ` data-ticker aria-label="${esc(t("tickerLabel"))}"`}>
  <div class="ticker-track">${group(false)}${group(true)}</div>
</div>`;
}

function nav(current) {
  const link = (href, text, key) =>
    `<a href="${href}"${current === key ? ' aria-current="page"' : ""}${key === "calendar" ? ' class="is-key"' : ""}>${text}</a>`;
  return `
<nav class="nav">
  <div class="nav-in">
    <a class="nav-logo" href="/" aria-label="${esc(site.name)} — home">
      <img src="/assets/sdt-mark.svg" alt="SDT" width="62" height="26">
      <span>${esc(t("logoSub"))}</span>
    </a>
    <div class="nav-links" id="nav-links">
      ${link("/repertoire/", t("navRepertoire"), "repertoire")}
      ${link("/calendar/", t("navCalendar"), "calendar")}
      ${link("/dancers/", t("navDancers"), "dancers")}
      ${link("/#contact", t("navContact"), "contact")}
    </div>
    <div class="nav-right">
      ${langSwitch()}
      <div class="nav-social">
        <a href="${esc(site.social.facebook)}" target="_blank" rel="noopener" aria-label="Facebook">${ICON.facebook}</a>
        <a href="${esc(site.social.instagram)}" target="_blank" rel="noopener" aria-label="Instagram">${ICON.instagram}</a>
      </div>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="nav-links" aria-label="${esc(t("menu"))}">${ICON.menu}</button>
    </div>
  </div>
</nav>`;
}

/* SK | EN — cieľ odkazu je rovnaká stránka v druhom jazyku */
function langSwitch() {
  return `<div class="lang" role="navigation" aria-label="${esc(t("langSwitch"))}">
        ${LANGS.map(
          (lg) =>
            `<a href="{{LANG:${lg}}}" hreflang="${lg}" lang="${lg}"${lg === lang ? ' aria-current="true"' : ""}>${lg.toUpperCase()}</a>`
        ).join('<i aria-hidden="true"></i>')}
      </div>`;
}

function contactSection() {
  const c = site.contact;
  return `
<section class="section wrap" id="contact" data-reveal>
  <div class="split top">
    <div class="sechead" style="margin:0">
      <p class="label">${esc(c.eyebrow)}</p>
      <h2 class="display">${c.heading}</h2>
      <p class="lede">${esc(c.body)}</p>
    </div>
    <div class="stack">
      <div class="contact-list">
        <span><span class="k">${esc(t("bookings"))}</span> <b>${esc(c.person)}</b></span>
        <a href="tel:${esc(c.phoneHref)}"><span class="k">${esc(t("phone"))}</span> <b>${esc(c.phone)}</b></a>
        <a href="mailto:${esc(c.email)}"><span class="k">${esc(t("email"))}</span> <b>${esc(c.email)}</b></a>
        ${c.email2 ? `<a href="mailto:${esc(c.email2)}"><span class="k">${esc(t("emailProd"))}</span> <b>${esc(c.email2)}</b></a>` : ""}
      </div>
    </div>
  </div>
  ${mapBlock()}
  ${c.photo ? `<figure class="contact-photo marks" data-reveal>
    <span class="shot"><img src="${esc(c.photo)}" alt="${esc(c.photoAlt)}" width="1400" height="612" loading="lazy" decoding="async"></span>
    <figcaption>${esc(c.photoCap)}</figcaption>
  </figure>` : ""}
</section>`;
}

/* bod 12 — minimalistická mapka. Vlastná kresba, žiadne externé dlaždice:
   nulové requesty, drží čiernobielu linku webu a načíta sa okamžite. */
function mapBlock() {
  const a = site.contact.address;
  if (!a) return "";
  const q = encodeURIComponent(a.full);
  return `
<div class="addr" data-reveal>
  <div class="addr-text">
    <p class="label">${esc(t("address"))}</p>
    <p class="addr-lines">${a.lines.map((l) => esc(l)).join("<br>")}</p>
    <a class="addr-link" href="https://www.google.com/maps/search/?api=1&amp;query=${q}" target="_blank" rel="noopener">
      <span>${esc(t("openMaps"))}</span>${ICON.right}
    </a>
  </div>
  <a class="addr-map" href="https://www.google.com/maps/search/?api=1&amp;query=${q}" target="_blank" rel="noopener" aria-label="${esc(a.full)} — ${esc(t("openMaps"))}">
    <svg viewBox="0 0 800 440" role="img" aria-hidden="true">
      <rect width="800" height="440" fill="#ffffff"/>
      <g fill="#f1f1f2">
        <rect x="-10" y="86" width="230" height="104"/>
        <rect x="248" y="78" width="250" height="106"/>
        <rect x="526" y="70" width="290" height="106"/>
        <rect x="-10" y="222" width="230" height="86"/>
        <rect x="248" y="214" width="250" height="84"/>
        <rect x="526" y="206" width="290" height="82"/>
      </g>
      <path d="M0 330 L800 288 L800 440 L0 440 Z" fill="#e6e6e8"/>
      <g stroke="#c9c9ce" stroke-width="1" opacity=".9">
        <path d="M0 360 L800 318"/><path d="M0 392 L800 350"/><path d="M0 424 L800 382"/>
      </g>
      <g stroke="#111114" fill="none">
        <path d="M0 208 L800 168" stroke-width="7"/>
        <path d="M0 72 L800 34" stroke-width="3.5"/>
        <path d="M232 60 L214 316" stroke-width="3"/>
        <path d="M510 48 L492 304" stroke-width="3"/>
        <path d="M676 300 L700 440" stroke-width="5"/>
      </g>
      <g font-family="Montserrat,Arial,sans-serif" font-size="13" font-weight="700" letter-spacing="3" fill="#8d8d96">
        <text x="24" y="196" transform="rotate(-2.9 24 196)">PRIBINOVA</text>
        <text x="24" y="60" transform="rotate(-2.7 24 60)">LANDEREROVA</text>
        <text x="52" y="398" transform="rotate(-3 52 398)" fill="#a8a8b0">${esc(t("mapRiver"))}</text>
      </g>
      <g class="pin" transform="translate(372 194)">
        <circle class="pin-ring" r="9" fill="none" stroke="#e0102a" stroke-width="2"/>
        <circle class="pin-ring is-2" r="9" fill="none" stroke="#e0102a" stroke-width="2"/>
        <g class="pin-core"><circle r="7.5" fill="#e0102a"/><circle r="2.6" fill="#ffffff"/></g>
      </g>
    </svg>
    <span class="addr-badge">Pribinova 25</span>
  </a>
</div>`;
}

function footer() {
  return `
<footer class="foot" data-foot-invert>
  ${ticker("is-foot")}
  <div class="foot-top">
    <a class="foot-logo" href="/" aria-label="${esc(site.nameSk)}">
      <span class="mark" role="img" aria-label="${esc(site.nameSk)}"></span>
    </a>
    <p class="foot-copy">© ${new Date().getFullYear()} ${esc(site.nameSk)}. ${esc(t("rights"))}</p>
  </div>
  <div class="foot-crop" data-spotlight aria-hidden="true">
    <span class="mark base"></span>
    <span class="mark lit"></span>
  </div>
</footer>`;
}

function popup() {
  const p = site.popup;
  if (!p || !p.enabled) return "";
  const prod = bySlug[p.production];
  return `
<aside class="pop" data-pop="${esc(p.production)}" data-delay="${p.delayMs}" hidden>
  <img src="${esc(prod ? prod.poster : "")}" alt="" width="92" height="124" loading="lazy">
  <div class="pop-body">
    <p class="label">${esc(p.eyebrow)}</p>
    <h3>${esc(p.title)}</h3>
    <p>${esc(p.body)}</p>
    <a class="btn btn-dark btn-sm" href="${esc(p.url)}" target="_blank" rel="noopener" style="justify-self:start;margin-top:4px">${esc(p.cta)}</a>
  </div>
  <button class="pop-close" type="button" aria-label="${esc(t("close"))}">${ICON.close}</button>
</aside>`;
}

function quotesBlock(quotes, id) {
  return `
<div class="quotes" data-quotes="${id}">
  ${quotes
    .map(
      (q, i) => `<figure class="quote${i === 0 ? " is-on" : ""}" style="margin:0">
    <div class="stars" aria-label="${q.stars} ${esc(t("outOf5"))}">${stars(q.stars)}</div>
    <blockquote>${t("qOpen")}${esc(q.text)}${t("qClose")}</blockquote>
    <cite>${esc(q.source)}</cite>
  </figure>`
    )
    .join("\n  ")}
</div>`;
}

function posterCard(p, hero = false) {
  const next = upcoming(p.slug)[0];
  const meta = next
    ? `${fmtShort(parseDate(next.date))} · ${esc(next.city)}`
    : esc(p.archived ? t("fromArchive") : t("datesSoon"));
  return `<a class="card${hero ? " is-hero" : ""}${p.archived ? " is-archived" : ""}" href="/repertoire/${p.slug}/">
  <div class="card-art">
    ${p.premiereBadge ? `<span class="card-badge">${esc(p.premiereBadge)}</span>` : ""}
    <img src="${esc(p.poster)}" alt="${esc(p.posterAlt)}" width="620" height="877" loading="lazy" decoding="async">
    <div class="card-cap">
      <h3>${esc(p.title)}</h3>
      <span>${meta}</span>
    </div>
  </div>
</a>`;
}

/* ---------- layout ---------- */
function layout({ title, description, current, body, bodyClass = "", path: canon = "/" }) {
  const OG_LOCALE = { sk: "sk_SK", en: "en_GB" };
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(site.url + L(canon))}">
<meta property="og:locale" content="${OG_LOCALE[lang] || lang}">
<link rel="canonical" href="${esc(site.url + L(canon))}">
${LANGS.map((lg) => `<link rel="alternate" hreflang="${lg}" href="${esc(site.url + L(canon, lg))}">`).join("\n")}
<link rel="alternate" hreflang="x-default" href="${esc(site.url + L(canon, DEFAULT_LANG))}">
<meta property="og:image" content="${esc(site.url)}/assets/photos/ensemble-wide.webp">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=Montserrat:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/assets/styles.css">
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ""} data-page="${esc(canon)}">
<a class="skip" href="#main">${esc(t("skip"))}</a>
<header class="topbar" data-topbar>
${nav(current)}
${ticker()}
</header>
<main id="main">
${body}
</main>
${footer()}
${popup()}
<script src="/assets/app.js" defer></script>
</body>
</html>`;
}

/* ---------- stránky ---------- */
function pageHome() {
  // bod 1 — Swan Lake patrí do stredu oblúka
  const featured = productions.filter((p) => p.featured && !p.archived).slice(0, 5);
  // Swan Lake patrí do stredu — pri párnom počte na ľavú stredovú pozíciu
  const swanAt = featured.findIndex((p) => p.slug === "swan-lake");
  if (swanAt > -1) featured.splice(Math.floor((featured.length - 1) / 2), 0, featured.splice(swanAt, 1)[0]);
  const a = site.about;
  const d = site.director;
  const h = site.hero;
  const g = site.gallery;

  const body = `
<section class="hero">
  <div class="hero-media" data-video="/assets/hero.webm,/assets/hero.mp4">
    <img class="poster" src="/assets/hero-poster.webp" alt="" width="1280" height="720" fetchpriority="high">
  </div>
  <div class="hero-scrim"></div>
  <div class="wrap hero-inner">
    ${quotesBlock(site.heroQuotes, "hero-dots")}
  </div>
  <div class="cue"><span>${esc(h.cue)}</span><i></i></div>
</section>

<section class="arc-sec" data-reveal>
  <div class="arc-wrap">
    <div class="arc n${featured.length}" id="home-arc" data-rail>
      ${featured.map((p) => posterCard(p, p.slug === "swan-lake")).join("\n      ")}
    </div>
    <div class="rail-nav">
      <button type="button" data-rail-prev="home-arc" aria-label="${esc(t("prev"))}">${ICON.left}</button>
      <button type="button" data-rail-next="home-arc" aria-label="${esc(t("next"))}">${ICON.right}</button>
    </div>
  </div>
</section>

<div class="divider" aria-hidden="true"><i></i><b></b><i></i></div>

<section class="section wrap" id="about" data-reveal>
  <div class="split">
    <div>
      <div class="sechead">
        <p class="label">${esc(a.eyebrow)}</p>
        <h2 class="display">${a.heading}</h2>
      </div>
      <div class="stack">
        ${a.body.map((x) => `<p class="lede">${esc(x)}</p>`).join("\n        ")}
      </div>
      <div class="stats">
        ${a.stats
          .map(
            (s, i) =>
              `<div class="stat" data-reveal style="--d:${i * 110}ms"><b data-count="${esc(s.value)}">${esc(s.value)}</b><span>${esc(s.label)}</span></div>`
          )
          .join("\n        ")}
      </div>
    </div>
    <div class="about-media">
      <span class="idx" aria-hidden="true"><b></b><span>${esc(a.since)}</span></span>
      <div class="framed marks">
        <figure class="figure square" style="margin:0">
          <img src="${esc(a.photo)}" alt="${esc(a.photoAlt)}" width="1100" height="1100" loading="lazy" decoding="async">
        </figure>
      </div>
      <p class="framed-cap">${esc(a.photoCap)}</p>
    </div>
  </div>
</section>

<div class="divider" aria-hidden="true"><i></i><b></b><i></i></div>

<section class="section wrap" data-reveal>
  <div class="sechead">
    <p class="label">${esc(g.eyebrow)}</p>
    <h2 class="display">${esc(g.heading)}</h2>
    <p class="lede">${esc(g.body)}</p>
  </div>
  <div class="gallery-rail" aria-hidden="true"><b>01 — ${String(g.items.length).padStart(2, "0")}</b><i></i><s></s><i></i></div>
  <div class="gallery">
    ${g.items.map((it, i) => `<figure class="g${i + 1}" data-reveal style="--d:${i * 110}ms">
      <img src="${esc(it.src)}" alt="${esc(it.alt)}" width="${it.w}" height="${it.h}" loading="lazy" decoding="async">
      <figcaption><em>${String(i + 1).padStart(2, "0")}</em><i></i>${esc(it.caption || "")}</figcaption>
    </figure>`).join("\n    ")}
  </div>
</section>

<div class="divider" aria-hidden="true"><i></i><b></b><i></i></div>

<section class="section wrap" data-reveal>
  <div class="split">
    <div class="duo${d.photoW > d.photoH ? " is-wide" : ""}">
      <figure class="duo-a${d.photoW > d.photoH ? " is-wide" : ""}" data-lit style="margin:0">
        <img src="${esc(d.photo)}" alt="${esc(d.name)}" width="${d.photoW || 575}" height="${d.photoH || 719}" loading="lazy" decoding="async">
      </figure>
      ${d.photo2 ? `<figure class="duo-b" data-lit style="margin:0">
        <img src="${esc(d.photo2)}" alt="${esc(d.name)}" width="539" height="719" loading="lazy" decoding="async">
      </figure>` : ""}
    </div>
    <div>
      <div class="sechead">
        <p class="label">${esc(d.role)}</p>
        <h2 class="display">${esc(d.name)}</h2>
      </div>
      <div class="stack">
        ${d.bio.map((x) => `<p class="lede">${esc(x)}</p>`).join("\n        ")}
      </div>
    </div>
  </div>
</section>

<div class="divider" aria-hidden="true"><i></i><b></b><i></i></div>
${contactSection()}`;

  return layout({
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    current: "home",
    path: "/",
    body,
  });
}

function pageRepertoire() {
  // bod 5 — všetkých päť titulov hneď hore, na jednu obrazovku
  const active = productions.filter((p) => !p.archived);
  const archive = productions.filter((p) => p.archived);
  const body = `
<section class="rep-top">
  <div class="wrap">
    <p class="label rep-label">${esc(t("repActive"))}</p>
    <div class="rep-strip n${active.length}">
      ${active.map((p) => posterCard(p)).join("\n      ")}
    </div>
  </div>
</section>

<section class="section tight wrap">
  <div class="sechead" style="margin-bottom:0">
    <p class="label">${esc(t("repLabel"))}</p>
    <h2 class="display">${t("repHeading")}</h2>
    <p class="lede">${esc(t("repLede"))}</p>
  </div>
</section>

${archive.length
  ? `<div class="divider" aria-hidden="true"><i></i><b></b><i></i></div>
<section class="section tight wrap rep-archive">
  <div class="sechead">
    <p class="label">${esc(t("repArchive"))}</p>
    <p class="lede">${esc(t("repArchiveLede"))}</p>
  </div>
  <div class="archive-strip">
    ${archive.map((p) => posterCard(p)).join("\n    ")}
  </div>
</section>`
  : ""}
`;
  return layout({
    title: `${t("repTitle")} — ${site.name}`,
    description: t("repDesc"),
    current: "repertoire",
    path: "/repertoire/",
    body,
  });
}

function pageCalendar() {
  const perfs = upcoming(null);
  const months = [];
  for (const p of perfs) {
    const k = monthKey(p.date);
    let m = months.find((x) => x.key === k);
    if (!m) months.push((m = { key: k, rows: [] }));
    m.rows.push(p);
  }

  const row = (p) => {
    const dt = parseDate(p.date);
    const prod = bySlug[p.production];
    const sold = p.status === "soldout";
    return `<div class="cal-row" data-production="${esc(p.production)}">
      <div class="cal-date">
        <b>${dt.getUTCDate()}</b>
        <span>${t("days")[dt.getUTCDay()]} · ${p.time}</span>
      </div>
      <a class="cal-thumb" href="/repertoire/${esc(p.production)}/" tabindex="-1" aria-hidden="true">
        <img src="/assets/photos/t-${esc(p.production)}.webp" alt="" width="520" height="260" loading="lazy" decoding="async">
      </a>
      <div class="cal-main">
        <a href="/repertoire/${esc(p.production)}/">${esc(prod ? prod.title : p.production)}</a>
        <span class="cal-meta">${esc(p.venue)}, ${esc(p.city)}${p.note ? ` <b class="cal-note">${esc(p.note)}</b>` : ""}</span>
      </div>
      <div class="cal-cta">
        ${sold
          ? `<span class="tag-out">${esc(t("soldOut"))}</span>`
          : `<a class="btn btn-line btn-sm" href="${esc(p.ticketUrl)}" target="_blank" rel="noopener">${esc(t("tickets"))}</a>`}
      </div>
    </div>`;
  };

  // bod 9 — hlavička na jeden riadok, filtre hneď navrchu
  const body = `
<section class="cal-head">
  <div class="wrap">
    <h1 class="cal-h1">${esc(t("calH1"))}</h1>
    <div class="cal-filters">
      <div class="cal-filter is-prod" data-cal-filter>
        <button type="button" data-filter="all" aria-pressed="true">${esc(t("all"))}</button>
        ${productions.filter((p) => perfs.some((x) => x.production === p.slug)).map((p) => `<button type="button" data-filter="${p.slug}" aria-pressed="false"><span class="cf-thumb"><img src="/assets/photos/t-${p.slug}.webp" alt="" width="520" height="260" loading="lazy" decoding="async"></span><span>${esc(p.title)}</span></button>`).join("\n        ")}
      </div>
      <div class="cal-filter is-month">
        <span class="flabel">${esc(t("jumpTo"))}</span>
        ${months.map((m) => `<a href="#m-${m.key}" data-month-jump>${monthName(m.key)}</a>`).join("\n        ")}
      </div>
    </div>
  </div>
</section>

<section class="wrap" style="padding-block:clamp(26px,3.2vw,44px) clamp(40px,5vw,72px)">
  ${months
    .map(
      (m) => `<div class="cal-month" id="m-${m.key}" data-month="${m.key}">
    <h3>${monthName(m.key)}</h3>
    ${m.rows.map(row).join("\n    ")}
  </div>`
    )
    .join("\n  ")}

  <p class="cal-empty" data-cal-empty hidden>${esc(t("calEmpty"))}</p>
</section>
`;

  return layout({
    title: `${t("calTitle")} — ${site.name}`,
    description: t("calDesc"),
    current: "calendar",
    path: "/calendar/",
    body,
  });
}

function pageDancers() {
  const groups = [];
  for (const d of site.dancers) {
    let g = groups.find((x) => x.name === d.group);
    if (!g) groups.push((g = { name: d.group, people: [] }));
    g.people.push(d);
  }
  const initials = (name) => name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
  const anyBio = site.dancers.some((d) => Array.isArray(d.bio) && d.bio.length > 0);

  const card = (d, i) => {
    const id = `bio-${i}`;
    const hasBio = Array.isArray(d.bio) && d.bio.length > 0;
    return `<div class="person-card" data-reveal style="--d:${(i % 8) * 60}ms">
      <button class="person-btn" type="button"${hasBio ? ` data-bio="${id}"` : " disabled"}>
        <span class="person-photo">
          ${d.photo
            ? `<img src="${esc(d.photo)}" alt="${esc(d.name)}" width="300" height="300" loading="lazy" decoding="async">`
            : `<span class="initials" aria-hidden="true">${esc(initials(d.name))}</span>`}
          ${hasBio ? `<span class="more">${ICON.plus}</span>` : ""}
        </span>
        <span class="person-name">
          <b>${esc(d.name)}</b>
          <span>${esc(d.role)}</span>
        </span>
      </button>
      ${hasBio
        ? `<template id="${id}" data-name="${esc(d.name)}" data-role="${esc(d.role)}" data-photo="${esc(d.photo || "")}">
        ${d.bio.map((x) => `<p>${esc(x)}</p>`).join("\n        ")}
      </template>`
        : ""}
    </div>`;
  };

  let n = 0;
  const body = `
<section class="section wrap">
  <div class="sechead">
    <p class="label">${esc(t("dancersLabel"))}</p>
    <h2 class="display">${t("dancersHeading")}</h2>
    ${anyBio ? `<p class="lede">${esc(t("dancersLede"))}</p>` : ""}
  </div>
  ${groups
    .map(
      (g, gi) => `<div class="people-group${gi === 0 ? " is-lead" : ""}">
    <h3>${esc(g.name)}</h3>
    <div class="people">
      ${g.people.map((d) => card(d, n++)).join("\n      ")}
    </div>
  </div>`
    )
    .join("\n  ")}
</section>

<dialog class="bio-modal" id="bio-modal" aria-label="${esc(t("bioLabel"))}">
  <button class="bio-close" type="button" aria-label="${esc(t("close"))}">${ICON.close}</button>
  <div class="bio-head">
    <span class="bio-photo" data-bio-photo></span>
    <div>
      <h3 class="bio-name display"></h3>
      <p class="bio-role label"></p>
    </div>
  </div>
  <div class="bio-text"></div>
</dialog>

`;

  return layout({
    title: `${t("dancersTitle")} — ${site.name}`,
    description: t("dancersDesc"),
    current: "dancers",
    path: "/dancers/",
    body,
  });
}

function pageProduction(p) {
  const perfs = upcoming(p.slug);
  const hasQuotes = p.quotes && p.quotes.length > 0;
  const gal = Array.isArray(p.gallery) ? p.gallery : [];

  /* pás najbližších termínov pod plagátom (referencia JANART) */
  const heroDate = (x) => {
    const dt = parseDate(x.date);
    const sold = x.status === "soldout";
    return `<a class="hd-cell${sold ? " is-out" : ""}" href="${sold ? "/calendar/" : esc(x.ticketUrl)}"${sold ? "" : ' target="_blank" rel="noopener"'}>
      <span class="hd-city">${esc(x.city)}</span>
      <span class="hd-venue">${x.note ? esc(x.note) : esc(x.venue)}</span>
      <span class="hd-when">
        <b>${fmtCaps(dt)}</b>
        <i>${sold ? esc(t("soldOut")) : esc(x.time)}</i>
      </span>
    </a>`;
  };

  /* rozklikávacia karta — funguje aj bez JS */
  const panel = (title, rows) =>
    `<details class="panel">
      <summary><span>${esc(title)}</span><i aria-hidden="true"></i></summary>
      <div class="panel-body">
        <dl class="credit-list">
          ${rows
            .map(
              ([role, names]) =>
                `<div><dt>${esc(role)}</dt><dd>${names.map((n) => `<span>${esc(n)}</span>`).join("")}</dd></div>`
            )
            .join("\n          ")}
        </dl>
      </div>
    </details>`;

  /* „4 najbližšie termíny“ / „4 upcoming dates“ */
  const datesLabel = (n) =>
    lang === "sk"
      ? `${n} ${n === 1 ? "najbližší termín" : n < 5 ? "najbližšie termíny" : "najbližších termínov"}`
      : `${n} upcoming date${n === 1 ? "" : "s"}`;
  const heroPos = p.heroPos ? ` style="object-position:${esc(p.heroPos)}"` : "";

  const body = `
<section class="show-hero">
  <div class="media">
    <img src="${esc(p.heroImage || p.poster)}" alt="" width="1400" height="788" fetchpriority="high"${heroPos}>
  </div>
  <div class="scrim"></div>
  <div class="wrap show-hero-inner">
    ${p.premiereBadge ? `<p class="label is-badge">${esc(p.premiereBadge)}</p>` : `<p class="label">${esc(site.nameSk)}</p>`}
    <h1 class="show-title">${esc(p.title)}</h1>
    <p class="show-sub">${esc(p.tagline)}</p>
  </div>
  ${perfs.length
    ? `<div class="hero-dates">
    ${perfs.slice(0, 6).map(heroDate).join("\n    ")}
    <a class="hd-all" href="/calendar/"><span>${ICON.cal}</span><b>${t("fullCal")}</b></a>
  </div>`
    : ""}
</section>

<div class="show-cta">
  <div class="show-cta-in">
    <p class="label">${esc(p.title)}${perfs.length ? ` · ${datesLabel(perfs.length)}` : ""}</p>
    ${p.trailer ? `<a class="btn btn-line" href="${esc(p.trailer)}" target="_blank" rel="noopener">${esc(t("trailer"))}</a>` : ""}
    ${p.archived
      ? `<span class="tag-out">${esc(t("fromArchive"))}</span>`
      : `<a class="btn btn-dark btn-big" href="${esc(p.ticketUrl)}" target="_blank" rel="noopener">${esc(t("tickets"))}</a>`}
  </div>
</div>

<section class="section wrap">
  <div class="split top">
    <div>
      <div class="sechead">
        <p class="label">${esc(t("aboutProd"))}</p>
        <h2 class="display">${esc(p.title)}</h2>
      </div>
      <div class="stack">
        ${p.description.map((x) => `<p class="lede">${esc(x)}</p>`).join("\n        ")}
      </div>
    </div>
    <div>
      <p class="label" style="margin-bottom:18px">${esc(t("credits"))}</p>
      <dl class="meta-list">
        ${p.credits
          .map((c) => `<div><dt>${esc(c.label)}</dt><dd>${esc(c.value)}</dd></div>`)
          .join("\n        ")}
        ${p.premiere ? `<div><dt>${esc(t("premiere"))}</dt><dd>${esc(p.premiere)}</dd></div>` : ""}
        ${p.performers ? `<div><dt>${esc(t("performers"))}</dt><dd>${p.performers}</dd></div>` : ""}
        ${p.duration ? `<div><dt>${esc(t("runtime"))}</dt><dd>${esc(p.duration)}</dd></div>` : ""}
      </dl>
    </div>
  </div>
</section>

${p.keyVisual
  ? `<section class="section tight wrap" data-reveal>
  <figure class="kv${p.keyVisual.w === p.keyVisual.h ? " is-square" : ""}">
    <img src="${esc(p.keyVisual.src)}" alt="${esc(t("keyVisual"))} — ${esc(p.title)}" width="${p.keyVisual.w}" height="${p.keyVisual.h}" loading="lazy" decoding="async">
  </figure>
</section>`
  : ""}

${p.trailer
  ? `<section class="section tight wrap" data-reveal>
  <a class="trailer" href="${esc(p.trailer)}" target="_blank" rel="noopener" aria-label="${esc(t("watchTrailerFor"))} ${esc(p.title)}">
    <img src="${esc(p.heroImage || p.poster)}" alt="" width="1400" height="788" loading="lazy" decoding="async"${heroPos}>
    <span class="trailer-veil"></span>
    <span class="trailer-play">${ICON.play}</span>
    <span class="trailer-cap"><b>${esc(t("watchTrailer"))}</b><i>${esc(p.title)}</i></span>
  </a>
</section>`
  : ""}

${hasQuotes
  ? `<section class="press band" data-reveal>
  <div class="wrap">
    <div class="press-grid">
      ${p.quotes
        .map(
          (q, i) => `<figure class="press-q" data-reveal style="--d:${i * 130}ms">
        <div class="stars" aria-label="${q.stars} ${esc(t("outOf5"))}">${stars(q.stars)}</div>
        <blockquote>${t("qOpen")}${esc(q.text)}${t("qClose")}</blockquote>
        <figcaption>${esc(q.source)}</figcaption>
      </figure>`
        )
        .join("\n      ")}
    </div>
  </div>
</section>`
  : ""}

${p.cast || p.production
  ? `<section class="section wrap" data-reveal>
  <div class="panels">
    ${p.cast ? panel(t("cast"), p.cast) : ""}
    ${p.production ? panel(t("production"), p.production) : ""}
  </div>
</section>`
  : ""}

${gal.length
  ? `<section class="section tight" data-reveal>
  <div class="wrap slider-head">
    <p class="label">${esc(t("gallery"))}</p>
    <div class="slider-nav">
      <button type="button" data-slide-prev aria-label="${esc(t("prevPhoto"))}">${ICON.left}</button>
      <span class="slider-count"><b data-slide-now>1</b> / ${gal.length}</span>
      <button type="button" data-slide-next aria-label="${esc(t("nextPhoto"))}">${ICON.right}</button>
    </div>
  </div>
  <div class="slider" data-slider>
    <div class="slider-track">
      ${gal
        .map(
          (src, i) => `<figure class="slide"${i === 0 ? ' data-first' : ""}>
        <img src="${esc(src)}" alt="${esc(p.title)} — ${esc(t("photo").toLowerCase())} ${i + 1}" width="1080" height="720" loading="${i < 2 ? "eager" : "lazy"}" decoding="async">
      </figure>`
        )
        .join("\n      ")}
    </div>
  </div>
  <div class="wrap slider-dots">
    ${gal.map((_, i) => `<button type="button" data-slide-to="${i}" aria-label="${esc(t("photo"))} ${i + 1}"${i === 0 ? ' aria-current="true"' : ""}></button>`).join("")}
  </div>
</section>`
  : ""}
`;

  return layout({
    title: `${p.title} — ${site.name}`,
    description: p.blurb,
    current: "repertoire",
    path: `/repertoire/${p.slug}/`,
    body,
  });
}

function pageLegal(title, intro) {
  const body = `
<section class="section narrow">
  <div class="sechead">
    <p class="label">${esc(title)}</p>
    <h2 class="display">${esc(title)}</h2>
    <p class="lede">${esc(intro)}</p>
  </div>
</section>
`;
  const slug = { [t("privacy")]: "/privacy/", [t("cookies")]: "/cookies/", [t("terms")]: "/terms/" }[title] || "/";
  return layout({ title: `${title} — ${site.name}`, description: intro, current: "", path: slug, body });
}

/* ---------- preview režim ----------
   PREVIEW=1 node build.mjs  → plochá štruktúra a relatívne odkazy,
   aby sa web dal otvoriť aj bez servera s pekným smerovaním URL.
   Produkčný build (bez PREVIEW) používa čisté adresy /repertoire/carmen/ a /en/repertoire/carmen/. */
const PREVIEW = !!process.env.PREVIEW;

/** /en/repertoire/carmen/ → en-show-carmen.html,  /calendar/ → calendar.html */
function flatName(p) {
  let pre = "";
  const m = p.match(/^\/([a-z]{2})\//);
  if (m && LANGS.includes(m[1]) && m[1] !== DEFAULT_LANG) {
    pre = m[1] + "-";
    p = p.slice(3);
  }
  const rest = p.replace(/^\/+|\/+$/g, "");
  if (!rest) return pre + "index.html";
  if (rest.startsWith("repertoire/")) return pre + "show-" + rest.slice("repertoire/".length) + ".html";
  return pre + rest + ".html";
}

function toPreview(html) {
  return html
    .replace(/(href|src)="\/assets\//g, '$1="assets/')
    .replace(/data-video="\/assets\/([^,"]+),\/assets\/([^"]+)"/g, 'data-video="assets/$1,assets/$2"')
    .replace(/href="(\/[^"#]*)(#[^"]*)?"/g, (_, p, hash = "") => `href="${flatName(p)}${hash}"`);
}

/** interné odkazy dostanú prefix jazyka (/calendar/ → /en/calendar/) */
function prefixLinks(html) {
  if (lang === DEFAULT_LANG) return html;
  return html.replace(/href="\/(?!assets\/|\/)/g, `href="/${lang}/`);
}

/** SK | EN prepínač ukazuje na rovnakú stránku v druhom jazyku */
function resolveSwitch(html, pagePath) {
  return html.replace(/\{\{LANG:([a-z]{2})\}\}/g, (_, lg) => L(pagePath, lg));
}

/* ---------- zápis ---------- */
async function write(pagePath, html) {
  html = resolveSwitch(prefixLinks(html), pagePath);
  const full = L(pagePath);                // /en/calendar/
  let file;
  if (PREVIEW) {
    file = path.join(DIST, flatName(full));
    html = toPreview(html);
  } else {
    file = path.join(DIST, full, "index.html");
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, html, "utf8");
  return file;
}

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

const written = [];
const urls = [];
for (const lg of LANGS) {
  useLang(lg);
  const pages = [
    ["/", pageHome],
    ["/repertoire/", pageRepertoire],
    ["/calendar/", pageCalendar],
    ["/dancers/", pageDancers],
    ...productions.map((p) => [`/repertoire/${p.slug}/`, () => pageProduction(p)]),
    ["/privacy/", () => pageLegal(t("privacy"), t("privacyIntro"))],
    ["/cookies/", () => pageLegal(t("cookies"), t("cookiesIntro"))],
    ["/terms/", () => pageLegal(t("terms"), t("termsIntro"))],
  ];
  for (const [pp, fn] of pages) {
    written.push(await write(pp, fn()));
    urls.push(L(pp));
  }
}
useLang(DEFAULT_LANG);

/* statické súbory */
await mkdir(path.join(DIST, "assets"), { recursive: true });
await cp(path.join(ROOT, "src/styles.css"), path.join(DIST, "assets/styles.css"));
await cp(path.join(ROOT, "src/app.js"), path.join(DIST, "assets/app.js"));
if (existsSync(path.join(ROOT, "static"))) {
  await cp(path.join(ROOT, "static"), path.join(DIST, "assets"), { recursive: true });
}

/* ---------- súbory pre Cloudflare Pages ---------- */
if (!PREVIEW) {
  // dlhá cache na obrázky/CSS/JS, HTML sa vždy overí
  await writeFile(
    path.join(DIST, "_headers"),
    `/assets/*
  Cache-Control: public, max-age=31536000, immutable

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
`,
    "utf8"
  );

  const today = new Date().toISOString().slice(0, 10);
  await writeFile(
    path.join(DIST, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${site.url}${u}</loc><lastmod>${today}</lastmod><priority>${u === "/" || u === L("/", "en") ? "1.0" : "0.7"}</priority></url>`
  )
  .join("\n")}
</urlset>
`,
    "utf8"
  );

  await writeFile(
    path.join(DIST, "robots.txt"),
    `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`,
    "utf8"
  );
}

console.log(`Built ${written.length} pages into dist/`);
for (const f of written) console.log("  " + path.relative(ROOT, f));
