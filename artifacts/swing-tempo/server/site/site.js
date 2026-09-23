/* 3to1 Golf — site behaviour. No dependencies. Every feature degrades to
 * readable static content without JS or with reduced motion. */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var clamp = function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); };

  document.addEventListener("DOMContentLoaded", function () {
    headerHairline();
    reveals();
    rhythm();
    ladder();
    tocHighlight();
  });

  /* Hairline under the sticky header once the page has scrolled. */
  function headerHairline() {
    var header = document.querySelector(".site-header");
    if (!header) return;
    var stage = document.querySelector(".rhythm");
    var update = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 4);
      if (stage) {
        var r = stage.getBoundingClientRect();
        header.classList.toggle("on-dark", r.top <= header.offsetHeight / 2 && r.bottom >= header.offsetHeight / 2);
      }
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
  }

  /* Quiet fade-up as chapters enter the viewport. */
  function reveals() {
    var items = document.querySelectorAll(".reveal");
    if (reduceMotion || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  }

  /* Signature moment: scrolling through the pinned black section scrubs a
   * 21/7 swing (933 ms, 28 frames). Top lands at 75% — three beats back,
   * one through. */
  function rhythm() {
    var section = document.querySelector(".rhythm");
    var track = document.querySelector("[data-track]");
    if (!section || !track) return;
    var marks = track.querySelectorAll(".mark");
    var units = track.querySelectorAll(".unit");
    var timeEl = section.querySelector('[data-readout="time"]');
    var frameEl = section.querySelector('[data-readout="frame"]');
    var TOTAL_S = 0.933, FRAMES = 28;

    function render(p) {
      track.style.setProperty("--pb", clamp(p / 0.75, 0, 1).toFixed(4));
      track.style.setProperty("--pd", clamp((p - 0.75) / 0.25, 0, 1).toFixed(4));
      marks.forEach(function (m) { m.classList.toggle("is-on", p >= parseFloat(m.dataset.at) - 0.0005); });
      units.forEach(function (u) { u.classList.toggle("is-on", p > parseFloat(u.dataset.from)); });
      timeEl.textContent = (p * TOTAL_S).toFixed(2) + "s";
      frameEl.textContent = String(Math.round(p * FRAMES));
    }

    if (reduceMotion) { render(1); return; }

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var rect = section.getBoundingClientRect();
        var travel = rect.height - window.innerHeight;
        var raw = travel > 0 ? -rect.top / travel : 1;
        // Hold briefly at both ends so the start and the finish can be read.
        render(clamp((raw - 0.1) / 0.78, 0, 1));
      });
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
  }

  /* Tempo ladder: the app's real presets, played with the same tones the app
   * uses (utils/audio.ts): 660/880/1100 Hz sine, or a C–E–A triangle "piano". */
  function ladder() {
    var root = document.querySelector("[data-ladder]");
    if (!root) return;
    var lists = root.querySelectorAll("[data-list]");
    var gameBtns = root.querySelectorAll("[data-game]");
    var soundBtns = root.querySelectorAll("[data-sound]");
    var status = root.querySelector("[data-status]");
    var sound = "tones";
    var ctx = null, active = null;

    function press(btns, btn) { btns.forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); }); }

    gameBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        press(gameBtns, btn);
        stop();
        lists.forEach(function (l) { l.hidden = l.dataset.list !== btn.dataset.game; });
      });
    });
    soundBtns.forEach(function (btn) {
      btn.addEventListener("click", function () { press(soundBtns, btn); sound = btn.dataset.sound; });
    });

    var VOICES = {
      tones: [[660, 0.10, 0.30], [880, 0.10, 0.40], [1100, 0.14, 0.55]],
      piano: [[523.25, 0.55, 0.40], [659.25, 0.55, 0.40], [880.0, 0.65, 0.45]]
    };

    function note(freq, dur, peak, at, kind, bag) {
      var osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = kind === "piano" ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, at);
      g.gain.setValueAtTime(0.0001, at);
      if (kind === "piano") {
        g.gain.linearRampToValueAtTime(peak, at + 0.02);
        g.gain.exponentialRampToValueAtTime(peak * 0.5, at + 0.15);
      } else {
        g.gain.linearRampToValueAtTime(peak, at + 0.005);
      }
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + dur + 0.05);
      bag.push(osc);
    }

    function stop() {
      if (!active) return;
      active.oscs.forEach(function (o) { try { o.stop(); } catch (e) { /* already stopped */ } });
      cancelAnimationFrame(active.raf);
      active.row.classList.remove("is-playing");
      active.head.style.transform = "";
      active = null;
    }

    root.querySelectorAll(".row").forEach(function (row) {
      row.addEventListener("click", function () {
        var wasThis = active && active.row === row;
        stop();
        if (wasThis) return;

        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        if (!ctx) ctx = new AC();
        if (ctx.state === "suspended") ctx.resume();

        var top = parseFloat(row.dataset.top) / 1000;
        var impact = parseFloat(row.dataset.impact) / 1000;
        var t0 = ctx.currentTime + 0.06;
        var v = VOICES[sound];
        var oscs = [];
        note(v[0][0], v[0][1], v[0][2], t0, sound, oscs);
        note(v[1][0], v[1][1], v[1][2], t0 + top, sound, oscs);
        note(v[2][0], v[2][1], v[2][2], t0 + impact, sound, oscs);

        var bar = row.querySelector(".row-bar");
        var head = row.querySelector(".head");
        var endPx = bar.clientWidth * (impact / 1.333);
        row.classList.add("is-playing");
        active = { row: row, head: head, oscs: oscs, raf: 0 };
        status.textContent = "Playing " + row.querySelector(".row-name").textContent;

        (function frame() {
          var t = ctx.currentTime - t0;
          if (t >= impact + 0.35) { stop(); return; }
          head.style.transform = "translateX(" + (clamp(t / impact, 0, 1) * endPx).toFixed(1) + "px)";
          active.raf = requestAnimationFrame(frame);
        })();
      });
    });
  }

  /* Privacy policy: highlight the section being read in the "On this page" list. */
  function tocHighlight() {
    var links = document.querySelectorAll(".toc a[href^='#']");
    if (!links.length || !("IntersectionObserver" in window)) return;
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.classList.remove("is-current"); });
        var link = byId[e.target.id];
        if (link) link.classList.add("is-current");
      });
    }, { rootMargin: "-80px 0px -70% 0px" });
    Object.keys(byId).forEach(function (id) {
      var h = document.getElementById(id);
      if (h) io.observe(h);
    });
  }
})();
