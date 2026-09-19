/* Slovak Dance Theatre — statický generátor.
   Bez závislostí. Číta data/*.json, zapisuje dist/.
   Spustenie:  node build.mjs          (Cloudflare Pages: build command = node build.mjs, output = dist) */

import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const DIST = path.join(ROOT, "dist");

const site = JSON.parse(await readFile(path.join(ROOT, "data/site.json"), "utf8"));
const data = JSON.parse(await readFile(path.join(ROOT, "data/events.json"), "utf8"));

const productions = data.productions;
const bySlug = Object.fromEntries(productions.map((p) => [p.slug, p]));

/* ---------- helpers ---------- */
const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function parseDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
const monthKey = (iso) => iso.slice(0, 7);
const monthName = (key) => {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
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
  cal: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><rect x="3.5" y="5" width="17" height="15.5" stroke="currentColor" stroke-width="1.5"/><path d="M3.5 9.6h17M8 3.4v3.4M16 3.4v3.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
};

/* ---------- spoločné bloky ---------- */
/* ---------- spoločné bloky ---------- */
function ticker() {
  const group = (hidden) =>
    `<div class="ticker-group"${hidden ? ' aria-hidden="true"' : ""}>${site.cities
      .map((c) => `<span>${esc(c)}</span>`)
      .join("")}</div>`;
  return `<div class="ticker" data-ticker aria-label="Cities the company has played">
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
      <span>Dance Theatre</span>
    </a>
    <div class="nav-links" id="nav-links">
      ${link("/repertoire/", "Repertoire", "repertoire")}
      ${link("/calendar/", "Calendar", "calendar")}
      ${link("/dancers/", "Dancers", "dancers")}
      ${link("/#contact", "Contact", "contact")}
    </div>
    <div class="nav-right">
      <div class="nav-social">
        <a href="${esc(site.social.facebook)}" target="_blank" rel="noopener" aria-label="Facebook">${ICON.facebook}</a>
        <a href="${esc(site.social.instagram)}" target="_blank" rel="noopener" aria-label="Instagram">${ICON.instagram}</a>
      </div>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="nav-links" aria-label="Menu">${ICON.menu}</button>
    </div>
  </div>
</nav>`;
}

function contactSection() {
  const c = site.contact;
  return `
<section class="section wrap" id="contact" data-reveal>
  <div class="split top">
    <div class="sechead" style="margin:0">
      <p class="label">${esc(c.eyebrow)}</p>
      <h2 class="display">Performances, bookings, <em>partnerships</em></h2>
      <p class="lede">${esc(c.body)}</p>
    </div>
    <div class="stack">
      <div class="contact-list">
        <span><span class="k">Bookings</span> <b>${esc(c.person)}</b></span>
        <a href="tel:${esc(c.phoneHref)}"><span class="k">Phone</span> <b>${esc(c.phone)}</b></a>
        <a href="mailto:${esc(c.email)}"><span class="k">Email</span> <b>${esc(c.email)}</b></a>
      </div>
    </div>
  </div>
  ${c.photo ? `<figure class="contact-photo marks" data-reveal>
    <span class="shot"><img src="${esc(c.photo)}" alt="The company on stage" width="1400" height="612" loading="lazy" decoding="async"></span>
    <figcaption>Slovak Dance Theatre — on stage</figcaption>
  </figure>` : ""}
</section>`;
}

function footer() {
  return `
<footer class="foot" data-foot-invert>
  <div class="foot-top">
    <a class="foot-logo" href="/" aria-label="${esc(site.nameSk)}">
      <span class="mark" role="img" aria-label="${esc(site.nameSk)}"></span>
    </a>
    <p class="foot-copy">© ${new Date().getFullYear()} ${esc(site.nameSk)}. All rights reserved.</p>
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
  <button class="pop-close" type="button" aria-label="Close">${ICON.close}</button>
</aside>`;
}

function quotesBlock(quotes, id) {
  return `
<div class="quotes" data-quotes="${id}">
  ${quotes
    .map(
      (q, i) => `<figure class="quote${i === 0 ? " is-on" : ""}" style="margin:0">
    <div class="stars" aria-label="${q.stars} out of 5">${stars(q.stars)}</div>
    <blockquote>“${esc(q.text)}”</blockquote>
    <cite>${esc(q.source)}</cite>
  </figure>`
    )
    .join("\n  ")}
</div>`;
}

function posterCard(p) {
  const next = upcoming(p.slug)[0];
  const meta = next
    ? `${DAYS[parseDate(next.date).getUTCDay()]} ${parseDate(next.date).getUTCDate()} ${MONTHS[parseDate(next.date).getUTCMonth()].slice(0, 3)} · ${esc(next.city)}`
    : "Dates soon";
  return `<a class="card" href="/repertoire/${p.slug}/">
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
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(site.url + canon)}">
<link rel="canonical" href="${esc(site.url + canon)}">
<meta property="og:image" content="${esc(site.url)}/assets/photos/ensemble-wide.webp">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=Montserrat:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/assets/styles.css">
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ""}>
<a class="skip" href="#main">Skip to content</a>
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
  const featured = productions.filter((p) => p.featured).slice(0, 5);
  const swanAt = featured.findIndex((p) => p.slug === "swan-lake");
  if (swanAt > -1) featured.splice(2, 0, featured.splice(swanAt, 1)[0]);
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
    <div class="arc" id="home-arc" data-rail>
      ${featured.map(posterCard).join("\n      ")}
    </div>
    <div class="rail-nav">
      <button type="button" data-rail-prev="home-arc" aria-label="Previous">${ICON.left}</button>
      <button type="button" data-rail-next="home-arc" aria-label="Next">${ICON.right}</button>
    </div>
  </div>
</section>

<div class="divider" aria-hidden="true"><i></i><b></b><i></i></div>

<section class="section wrap" id="about" data-reveal>
  <div class="split">
    <div>
      <div class="sechead">
        <p class="label">${esc(a.eyebrow)}</p>
        <h2 class="display">Slovakia's leading independent <em>contemporary ballet</em> company</h2>
      </div>
      <div class="stack">
        ${a.body.map((t) => `<p class="lede">${esc(t)}</p>`).join("\n        ")}
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
      <span class="idx" aria-hidden="true"><b></b><span>Est. 2005 — Bratislava</span></span>
      <div class="framed marks">
        <figure class="figure square" style="margin:0">
          <img src="${esc(a.photo)}" alt="The company in rehearsal with Ján Ďurovčík" width="1100" height="1100" loading="lazy" decoding="async">
        </figure>
      </div>
      <p class="framed-cap">In rehearsal, Bratislava</p>
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
    <div class="duo">
      <figure class="duo-a" style="margin:0">
        <img src="${esc(d.photo)}" alt="${esc(d.name)}" width="760" height="950" loading="lazy" decoding="async">
      </figure>
      ${d.photo2 ? `<figure class="duo-b" style="margin:0">
        <img src="${esc(d.photo2)}" alt="${esc(d.name)}" width="560" height="747" loading="lazy" decoding="async">
      </figure>` : ""}
    </div>
    <div>
      <div class="sechead">
        <p class="label">${esc(d.role)}</p>
        <h2 class="display">${esc(d.name)}</h2>
      </div>
      <div class="stack">
        ${d.bio.map((t) => `<p class="lede">${esc(t)}</p>`).join("\n        ")}
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
  const body = `
<section class="rep-top">
  <div class="wrap">
    <div class="rep-strip">
      ${productions.map(posterCard).join("\n      ")}
    </div>
  </div>
</section>

<section class="section tight wrap">
  <div class="sechead">
    <p class="label">Repertoire</p>
    <h2 class="display">Five productions <em>in rotation</em></h2>
    <p class="lede">Each piece is choreographed and directed by Ján Ďurovčík and performed by the company in Slovakia and on tour.</p>
  </div>
</section>
`;
  return layout({
    title: `Repertoire — ${site.name}`,
    description: "The full repertoire of the Slovak Dance Theatre.",
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
        <span>${DAYS[dt.getUTCDay()]} · ${p.time}</span>
      </div>
      <a class="cal-thumb" href="/repertoire/${esc(p.production)}/" tabindex="-1" aria-hidden="true">
        <img src="/assets/photos/t-${esc(p.production)}.webp" alt="" width="520" height="260" loading="lazy" decoding="async">
      </a>
      <div class="cal-main">
        <a href="/repertoire/${esc(p.production)}/">${esc(prod ? prod.title : p.production)}</a>
        <span class="cal-meta">${esc(p.venue)}, ${esc(p.city)}</span>
      </div>
      <div class="cal-cta">
        ${sold
          ? `<span class="tag-out">Sold out</span>`
          : `<a class="btn btn-line btn-sm" href="${esc(p.ticketUrl)}" target="_blank" rel="noopener">Tickets</a>`}
      </div>
    </div>`;
  };

  // bod 9 — hlavička na jeden riadok, filtre hneď navrchu
  const body = `
<section class="cal-head">
  <div class="wrap">
    <h1 class="cal-h1">Upcoming performances, sold both on ticketportal and predpredaj</h1>
    <div class="cal-filters">
      <div class="cal-filter is-prod" data-cal-filter>
        <button type="button" data-filter="all" aria-pressed="true">All</button>
        ${productions.map((p) => `<button type="button" data-filter="${p.slug}" aria-pressed="false"><span class="cf-thumb"><img src="/assets/photos/t-${p.slug}.webp" alt="" width="520" height="260" loading="lazy" decoding="async"></span><span>${esc(p.title)}</span></button>`).join("\n        ")}
      </div>
      <div class="cal-filter is-month">
        <span class="flabel">Jump to</span>
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

  <p class="cal-empty" data-cal-empty hidden>No upcoming dates for this production yet.</p>
</section>
`;

  return layout({
    title: `Calendar — ${site.name}`,
    description: "Upcoming performances of the Slovak Dance Theatre.",
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
        ${d.bio.map((t) => `<p>${esc(t)}</p>`).join("\n        ")}
      </template>`
        : ""}
    </div>`;
  };

  let n = 0;
  const body = `
<section class="section wrap">
  <div class="sechead">
    <p class="label">Dancers</p>
    <h2 class="display">Team &amp; <em>artists</em></h2>
    ${anyBio ? `<p class="lede">Click a portrait to read more.</p>` : ""}
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

<dialog class="bio-modal" id="bio-modal" aria-label="Dancer biography">
  <button class="bio-close" type="button" aria-label="Close">${ICON.close}</button>
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
    title: `Dancers — ${site.name}`,
    description: "The dancers and artistic team of the Slovak Dance Theatre.",
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
      <span class="hd-venue">${esc(x.venue)}</span>
      <span class="hd-when">
        <b>${DAYS[dt.getUTCDay()].toUpperCase()} ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()].slice(0, 3).toUpperCase()}</b>
        <i>${sold ? "Sold out" : esc(x.time)}</i>
      </span>
    </a>`;
  };

  /* rozklikávacia karta — funguje aj bez JS */
  const panel = (title, rows, open) =>
    `<details class="panel"${open ? " open" : ""}>
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

  const body = `
<section class="show-hero">
  <div class="media">
    <img src="${esc(p.heroImage || p.poster)}" alt="" width="1400" height="788" fetchpriority="high">
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
    <a class="hd-all" href="/calendar/"><span>${ICON.cal}</span><b>Full<br>calendar</b></a>
  </div>`
    : ""}
</section>

<div class="show-cta">
  <div class="show-cta-in">
    <p class="label">${esc(p.title)}${perfs.length ? ` · ${perfs.length} upcoming date${perfs.length > 1 ? "s" : ""}` : ""}</p>
    ${p.trailer ? `<a class="btn btn-line" href="${esc(p.trailer)}" target="_blank" rel="noopener">Trailer</a>` : ""}
    <a class="btn btn-dark btn-big" href="${esc(p.ticketUrl)}" target="_blank" rel="noopener">Tickets</a>
  </div>
</div>

<section class="section wrap">
  <div class="split top">
    <div>
      <div class="sechead">
        <p class="label">About the production</p>
        <h2 class="display">${esc(p.title)}</h2>
      </div>
      <div class="stack">
        ${p.description.map((t) => `<p class="lede">${esc(t)}</p>`).join("\n        ")}
      </div>
    </div>
    <div>
      <p class="label" style="margin-bottom:18px">Credits</p>
      <dl class="meta-list">
        ${Object.entries(p.credits)
          .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
          .join("\n        ")}
        <div><dt>Premiere</dt><dd>${esc(p.premiere)}</dd></div>
        <div><dt>Performers</dt><dd>${p.performers}</dd></div>
        <div><dt>Running time</dt><dd>${esc(p.duration)}</dd></div>
      </dl>
    </div>
  </div>
</section>

${hasQuotes
  ? `<section class="press band" data-reveal>
  <div class="wrap">
    <p class="label press-label">Press</p>
    <div class="press-grid">
      ${p.quotes
        .map(
          (q, i) => `<figure class="press-q" data-reveal style="--d:${i * 130}ms">
        <div class="stars" aria-label="${q.stars} out of 5">${stars(q.stars)}</div>
        <blockquote>“${esc(q.text)}”</blockquote>
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
    ${p.cast ? panel("Obsadenie", p.cast, true) : ""}
    ${p.production ? panel("Production", p.production, false) : ""}
  </div>
</section>`
  : ""}

${gal.length
  ? `<section class="section tight" data-reveal>
  <div class="wrap slider-head">
    <p class="label">Gallery</p>
    <div class="slider-nav">
      <button type="button" data-slide-prev aria-label="Previous photo">${ICON.left}</button>
      <span class="slider-count"><b data-slide-now>1</b> / ${gal.length}</span>
      <button type="button" data-slide-next aria-label="Next photo">${ICON.right}</button>
    </div>
  </div>
  <div class="slider" data-slider>
    <div class="slider-track">
      ${gal
        .map(
          (src, i) => `<figure class="slide"${i === 0 ? ' data-first' : ""}>
        <img src="${esc(src)}" alt="${esc(p.title)} — photo ${i + 1}" width="1080" height="720" loading="${i < 2 ? "eager" : "lazy"}" decoding="async">
      </figure>`
        )
        .join("\n      ")}
    </div>
  </div>
  <div class="wrap slider-dots">
    ${gal.map((_, i) => `<button type="button" data-slide-to="${i}" aria-label="Photo ${i + 1}"${i === 0 ? ' aria-current="true"' : ""}></button>`).join("")}
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
  return layout({ title: `${title} — ${site.name}`, description: intro, current: "", body });
}

/* ---------- preview režim ----------
   PREVIEW=1 node build.mjs  → plochá štruktúra a relatívne odkazy,
   aby sa web dal otvoriť aj bez servera s pekným smerovaním URL.
   Produkčný build (bez PREVIEW) používa čisté adresy /repertoire/carmen/. */
const PREVIEW = !!process.env.PREVIEW;

function toPreview(html) {
  return html
    .replace(/(href|src)="\/assets\//g, '$1="assets/')
    .replace(/data-video="\/assets\/([^,"]+),\/assets\/([^"]+)"/g, 'data-video="assets/$1,assets/$2"')
    .replace(/href="\/repertoire\/([a-z0-9-]+)\/"/g, 'href="show-$1.html"')
    .replace(/href="\/repertoire\/"/g, 'href="repertoire.html"')
    .replace(/href="\/calendar\/"/g, 'href="calendar.html"')
    .replace(/href="\/dancers\/"/g, 'href="dancers.html"')
    .replace(/href="\/privacy\/"/g, 'href="privacy.html"')
    .replace(/href="\/cookies\/"/g, 'href="cookies.html"')
    .replace(/href="\/terms\/"/g, 'href="terms.html"')
    .replace(/href="\/#contact"/g, 'href="index.html#contact"')
    .replace(/href="\/"/g, 'href="index.html"');
}

const PREVIEW_NAME = {
  ".": "index.html",
  repertoire: "repertoire.html",
  calendar: "calendar.html",
  dancers: "dancers.html",
  privacy: "privacy.html",
  cookies: "cookies.html",
  terms: "terms.html",
};

/* ---------- zápis ---------- */
async function write(rel, html) {
  let file;
  if (PREVIEW) {
    const name = PREVIEW_NAME[rel] || rel.replace(/^repertoire\//, "show-") + ".html";
    file = path.join(DIST, name);
    html = toPreview(html);
  } else {
    file = path.join(DIST, rel, "index.html");
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, html, "utf8");
  return file;
}

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

const written = [];
written.push(await write(".", pageHome()));
written.push(await write("repertoire", pageRepertoire()));
written.push(await write("calendar", pageCalendar()));
written.push(await write("dancers", pageDancers()));
for (const p of productions) written.push(await write(`repertoire/${p.slug}`, pageProduction(p)));
written.push(await write("privacy", pageLegal("Privacy", "Privacy policy — to be supplied.")));
written.push(await write("cookies", pageLegal("Cookies", "Cookie policy — to be supplied. This site uses no tracking cookies.")));
written.push(await write("terms", pageLegal("Terms", "Terms of use — to be supplied.")));

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

  const urls = [
    "/",
    "/repertoire/",
    "/calendar/",
    "/dancers/",
    ...productions.map((p) => `/repertoire/${p.slug}/`),
    "/privacy/",
    "/cookies/",
    "/terms/",
  ];
  const today = new Date().toISOString().slice(0, 10);
  await writeFile(
    path.join(DIST, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${site.url}${u}</loc><lastmod>${today}</lastmod><priority>${u === "/" ? "1.0" : "0.7"}</priority></url>`
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
