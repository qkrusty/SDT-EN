/* Slovak Dance Theatre — zdieľaný skript.
   Všetko je progresívne vylepšenie: bez JS stránka funguje a je čitateľná. */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var conn = navigator.connection || {};
  var heavyOk = window.innerWidth >= 768 && !reduce && !conn.saveData;

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /* Označíme, že JS beží — bez neho sa nič neskrýva a stránka je celá čitateľná. */
  document.documentElement.classList.add("js");

  /* ---------- bod 7: nová stránka vždy začína hore ----------
     Prehliadač si inak pamätá pozíciu scrollu z predchádzajúcej stránky
     a po prekliku v menu skončíš v jej strede. */
  (function topOnLoad() {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    function toTop() {
      if (location.hash) return;                 // odkaz na kotvu necháme tak
      var b = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(0, 0);
      document.documentElement.style.scrollBehavior = b;
    }
    toTop();
    window.addEventListener("load", toTop);
    window.addEventListener("pageshow", function (e) { if (e.persisted) toTop(); });
  })();

  /* ---------- bod 12: mestá sa pri scrolle schovajú, menu sa zoštíhli ----------
     Prepínač je jedna trieda na hlavičke, celý pohyb rieši CSS prechod. */
  (function topbar() {
    var bar = $("[data-topbar]");
    if (!bar) return;
    var on = false, ticking = false;
    function apply() {
      ticking = false;
      var want = window.scrollY > 90;
      if (want === on) return;
      on = want;
      bar.classList.toggle("is-compact", on);
    }
    apply();
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    }, { passive: true });
  })();

  /* ---------- bod 2: čísla v „About us“ sa dopočítajú ---------- */
  (function counters() {
    var nums = $$("[data-count]");
    if (!nums.length) return;
    if (reduce || !("IntersectionObserver" in window)) return;

    function run(el) {
      var raw = el.dataset.count || "";
      var m = raw.match(/^(\D*)([\d\s]+)(\D*)$/);
      if (!m) return;
      var target = parseInt(m[2].replace(/\s/g, ""), 10);
      if (!isFinite(target) || target <= 0) return;
      var pre = m[1], post = m[3], t0 = 0, dur = 1300;
      // rok nemá zmysel rátať od nuly — rozbehne sa tesne pod ním
      var from = !post && target > 1800 && target < 2200 ? target - 30 : 0;
      el.style.fontVariantNumeric = "tabular-nums";
      function step(t) {
        if (!t0) t0 = t;
        var k = Math.min(1, (t - t0) / dur);
        var e = 1 - Math.pow(1 - k, 3);          // spomalenie na konci
        el.textContent = pre + Math.round(from + (target - from) * e) + post;
        if (k < 1) requestAnimationFrame(step);
        else el.textContent = raw;
      }
      requestAnimationFrame(step);
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        run(en.target);
      });
    }, { threshold: 0.6 });
    nums.forEach(function (el) { io.observe(el); });
  })();

  /* ---------- plynulé odhaľovanie sekcií pri scrolle ---------- */
  (function reveal() {
    var items = $$("[data-reveal]");
    if (!items.length) return;
    if (reduce || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add("in");
        io.unobserve(en.target);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.06 });

    items.forEach(function (el) {
      // čo je hneď vo výreze pri načítaní, ukážeme bez čakania na scroll
      if (el.getBoundingClientRect().top < window.innerHeight * 0.9) el.classList.add("in");
      else io.observe(el);
    });
  })();

  /* ---------- mobilné menu ---------- */
  var navToggle = $(".nav-toggle"), navLinks = $("#nav-links");
  if (navToggle && navLinks) {
    var syncNav = function () {
      var mobile = window.innerWidth <= 860;
      navLinks.hidden = mobile && navToggle.getAttribute("aria-expanded") !== "true";
    };
    navToggle.addEventListener("click", function () {
      var open = navToggle.getAttribute("aria-expanded") === "true";
      navToggle.setAttribute("aria-expanded", open ? "false" : "true");
      syncNav();
    });
    window.addEventListener("resize", function () {
      navToggle.setAttribute("aria-expanded", "false");
      syncNav();
    });
    syncNav();
  }

  /* ---------- video: až po load stránky, nikdy na mobile ---------- */
  $$("[data-video]").forEach(function (holder) {
    var note = $("[data-video-note]");
    if (!heavyOk) {
      if (note) note.textContent = "Mobile: poster only, 23 kB";
      return;
    }
    var start = function () {
      var v = document.createElement("video");
      v.muted = true; v.loop = true; v.playsInline = true;
      v.setAttribute("muted", ""); v.setAttribute("playsinline", "");
      v.setAttribute("aria-hidden", "true"); v.tabIndex = -1;
      holder.dataset.video.split(",").forEach(function (src) {
        var s = document.createElement("source");
        s.src = src.trim();
        s.type = /\.webm$/.test(src.trim()) ? "video/webm" : "video/mp4";
        v.appendChild(s);
      });
      holder.appendChild(v);
      v.addEventListener("playing", function () { v.classList.add("on"); }, { once: true });
      var p = v.play();
      if (p && p.catch) p.catch(function () { v.remove(); });
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start);
  });

  /* ---------- rotujúce kritiky ---------- */
  $$("[data-quotes]").forEach(function (box) {
    var items = $$(".quote", box);
    if (items.length < 2) return;
    var dotBox = $("#" + box.dataset.quotes);
    var dots = dotBox ? $$("button", dotBox) : [];
    var cur = 0, timer = null;

    function show(i) {
      cur = i;
      items.forEach(function (el, j) { el.classList.toggle("is-on", j === i); });
      dots.forEach(function (el, j) { el.setAttribute("aria-current", j === i ? "true" : "false"); });
    }
    function restart() {
      if (timer) clearInterval(timer);
      if (!reduce) timer = setInterval(function () { show((cur + 1) % items.length); }, 6200);
    }
    dots.forEach(function (b, i) {
      b.addEventListener("click", function () { show(i); restart(); });
    });
    show(0); restart();
  });

  /* ---------- carousel plagátov ---------- */
  $$("[data-rail]").forEach(function (rail) {
    var prev = $('[data-rail-prev="' + rail.id + '"]');
    var next = $('[data-rail-next="' + rail.id + '"]');
    if (!prev || !next) return;

    function step() {
      var first = rail.firstElementChild;
      if (!first) return rail.clientWidth * 0.8;
      var gap = parseFloat(getComputedStyle(rail).columnGap || "16") || 16;
      return first.getBoundingClientRect().width + gap;
    }
    function sync() {
      var max = rail.scrollWidth - rail.clientWidth - 2;
      prev.disabled = rail.scrollLeft <= 2;
      next.disabled = rail.scrollLeft >= max;
    }
    prev.addEventListener("click", function () {
      rail.scrollBy({ left: -step(), behavior: reduce ? "auto" : "smooth" });
    });
    next.addEventListener("click", function () {
      rail.scrollBy({ left: step(), behavior: reduce ? "auto" : "smooth" });
    });
    rail.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    sync();
  });

  /* ---------- svetlo na odseknutom logu v pätičke (bod 8) ---------- */
  $$("[data-spotlight]").forEach(function (stage) {
    var lit = $(".lit", stage);
    if (!lit) return;
    var t0 = performance.now(), idle = true, raf = null, visible = true;

    function place(x, y) {
      lit.style.setProperty("--mx", x + "%");
      lit.style.setProperty("--my", y + "%");
    }
    function drift(now) {
      if (!idle || !visible) { raf = null; return; }
      var t = (now - t0) / 1000;
      place(50 + 30 * Math.sin(t * 0.42), 46 + 16 * Math.sin(t * 0.67 + 1.2));
      raf = requestAnimationFrame(drift);
    }
    function startDrift() {
      if (reduce || raf) return;
      t0 = performance.now() - 0;
      raf = requestAnimationFrame(drift);
    }
    place(50, 46);
    if (!reduce) startDrift();

    stage.addEventListener("pointermove", function (e) {
      idle = false;
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      var r = stage.getBoundingClientRect();
      place(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
    });
    stage.addEventListener("pointerleave", function () {
      idle = true; t0 = performance.now();
      if (!reduce) startDrift(); else place(50, 46);
    });

    // kým pätička nie je na obrazovke, animácia nebeží
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible && idle) startDrift();
        else if (raf) { cancelAnimationFrame(raf); raf = null; }
      }, { rootMargin: "80px" }).observe(stage);
    }
  });

  /* ---------- bod 6: veľký slider galérie ----------
     Posúva sa natívnym scrollom (funguje aj prstom a bez JS),
     JS len dopĺňa šípky, bodky a stlmenie vedľajších snímok. */
  (function slider() {
    var box = $("[data-slider]");
    if (!box) return;
    var slides = $$(".slide", box);
    if (!slides.length) return;
    var prev = $("[data-slide-prev]"), next = $("[data-slide-next]");
    var dots = $$("[data-slide-to]"), now = $("[data-slide-now]");
    var i = 0, ticking = false;

    function centerOf(el) {
      return el.offsetLeft + el.offsetWidth / 2 - box.clientWidth / 2;
    }
    function go(n, smooth) {
      i = Math.max(0, Math.min(slides.length - 1, n));
      box.scrollTo({ left: centerOf(slides[i]), behavior: smooth === false ? "auto" : "smooth" });
      paint();
    }
    function paint() {
      slides.forEach(function (s, n) { s.classList.toggle("is-on", n === i); });
      dots.forEach(function (d, n) {
        if (n === i) d.setAttribute("aria-current", "true");
        else d.removeAttribute("aria-current");
      });
      if (now) now.textContent = i + 1;
      if (prev) prev.disabled = i === 0;
      if (next) next.disabled = i === slides.length - 1;
    }
    function nearest() {
      var mid = box.scrollLeft + box.clientWidth / 2, best = 0, bd = Infinity;
      slides.forEach(function (s, n) {
        var d = Math.abs(s.offsetLeft + s.offsetWidth / 2 - mid);
        if (d < bd) { bd = d; best = n; }
      });
      return best;
    }

    if (prev) prev.addEventListener("click", function () { go(i - 1); });
    if (next) next.addEventListener("click", function () { go(i + 1); });
    dots.forEach(function (d, n) { d.addEventListener("click", function () { go(n); }); });
    box.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var n = nearest();
        if (n !== i) { i = n; paint(); }
      });
    }, { passive: true });
    box.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
    });
    box.tabIndex = 0;
    go(0, false);
    window.addEventListener("resize", function () { go(i, false); });
  })();

  /* ---------- filter kalendára ---------- */
  var calFilter = $("[data-cal-filter]");
  if (calFilter) {
    var empty = $("[data-cal-empty]");
    calFilter.addEventListener("click", function (e) {
      var btn = e.target.closest("button");
      if (!btn) return;
      var key = btn.dataset.filter;
      $$("button", calFilter).forEach(function (b) {
        b.setAttribute("aria-pressed", b === btn ? "true" : "false");
      });
      $$("[data-production]").forEach(function (row) {
        row.hidden = key !== "all" && row.dataset.production !== key;
      });
      var shown = 0;
      $$(".cal-month").forEach(function (m) {
        var any = $$("[data-production]", m).some(function (r) { return !r.hidden; });
        m.hidden = !any;
        if (any) shown++;
      });
      if (empty) empty.hidden = shown > 0;
    });
  }

  /* ---------- bio tanečníka v modálnom okne (bod 5) ---------- */
  (function bioModal() {
    var modal = $("#bio-modal");
    if (!modal) return;
    var nameEl = $(".bio-name", modal), roleEl = $(".bio-role", modal);
    var photoEl = $("[data-bio-photo]", modal), textEl = $(".bio-text", modal);
    var closeBtn = $(".bio-close", modal);
    var opener = null;

    function open(btn) {
      var tpl = document.getElementById(btn.dataset.bio || "");
      if (!tpl) return;
      opener = btn;
      nameEl.textContent = tpl.dataset.name || "";
      roleEl.textContent = tpl.dataset.role || "";
      /* bod 10 — fotka je klon miniatúry z dlaždice, takže sa nemôže rozísť s cestou */
      var thumb = btn.querySelector(".person-photo img");
      photoEl.replaceChildren();
      if (thumb) {
        var copy = thumb.cloneNode(true);
        copy.removeAttribute("loading");
        copy.alt = "";
        photoEl.appendChild(copy);
        photoEl.hidden = false;
      } else {
        photoEl.hidden = true;
      }
      textEl.replaceChildren(tpl.content.cloneNode(true));
      if (modal.showModal) modal.showModal();
      else modal.setAttribute("open", "");
    }
    function close() {
      if (modal.close) modal.close();
      else modal.removeAttribute("open");
      if (opener) { opener.focus(); opener = null; }
    }

    $$(".person-btn[data-bio]").forEach(function (btn) {
      btn.addEventListener("click", function () { open(btn); });
    });
    closeBtn.addEventListener("click", close);
    // klik mimo okna (na podklad) zavrie
    modal.addEventListener("click", function (e) {
      if (e.target === modal) close();
    });
  })();

  /* ---------- inverzia pätičky pri scrollovaní ----------
     Moderné prehliadače to zvládnu samy cez scroll-driven animáciu v CSS.
     Tu je záloha pre ostatné: počíta sa len kým je pätička na obrazovke
     a najviac raz za snímku, takže scrollovanie nespomaľuje. */
  (function footInvert() {
    var foot = $("[data-foot-invert]");
    if (!foot || reduce) return;
    if (window.CSS && CSS.supports && CSS.supports("animation-timeline", "view()")) return;

    var ticking = false, watching = false;

    function apply() {
      ticking = false;
      var r = foot.getBoundingClientRect();
      var span = Math.max(r.height, 1);
      var p = Math.max(0, Math.min(1, (window.innerHeight - r.top) / span));
      // pozadie plynulo, text skokom uprostred — inak by sa v polovici stratil kontrast
      var bg = Math.max(0, Math.min(1, (p - 0.32) / 0.52));
      var ink = p < 0.58 ? 0 : 1;
      foot.style.setProperty("--inv", bg.toFixed(3));
      foot.style.setProperty("--inkp", ink);
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    }
    function watch(on) {
      if (on === watching) return;
      watching = on;
      if (on) window.addEventListener("scroll", onScroll, { passive: true });
      else window.removeEventListener("scroll", onScroll);
    }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        watch(entries[0].isIntersecting);
        apply();
      }, { rootMargin: "120px 0px 0px 0px" }).observe(foot);
    } else {
      watch(true);
    }
    apply();
  })();

  /* ---------- vyskakovacie okno ---------- */
  var pop = $("[data-pop]");
  if (pop) {
    var KEY = "sdt-pop-" + (pop.dataset.pop || "x");
    var hidden = false;
    try { hidden = localStorage.getItem(KEY) === "1"; } catch (err) { hidden = false; }
    if (!hidden) {
      setTimeout(function () {
        pop.hidden = false;
        requestAnimationFrame(function () { pop.classList.add("is-on"); });
      }, parseInt(pop.dataset.delay || "6000", 10));
    }
    var close = $(".pop-close", pop);
    if (close) close.addEventListener("click", function () {
      pop.classList.remove("is-on");
      setTimeout(function () { pop.hidden = true; }, 400);
      try { localStorage.setItem(KEY, "1"); } catch (err) { /* súkromné okno — nevadí */ }
    });
  }
})();
