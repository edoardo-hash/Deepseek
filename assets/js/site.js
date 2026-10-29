/* =========================================================================
   Invenio Homes — motion + interaction
   GSAP · ScrollTrigger · SplitText · Lenis
   Everything degrades gracefully: content is visible without JS, and the
   reduced-motion path removes every animation.
   ========================================================================= */

(function () {
  "use strict";

  const doc = document;
  const root = doc.documentElement;
  const body = doc.body;
  const $ = (sel, ctx = doc) => ctx.querySelector(sel);
  const $$ = (sel, ctx = doc) => Array.from(ctx.querySelectorAll(sel));
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = window.matchMedia("(pointer: fine)").matches;
  const hasGsap = typeof window.gsap !== "undefined";
  const hasST = hasGsap && typeof window.ScrollTrigger !== "undefined";
  const hasSplit = hasGsap && typeof window.SplitText !== "undefined";
  const hasLenis = typeof window.Lenis !== "undefined";

  let lenis = null;
  let motionStarted = false;
  let scrollY = window.scrollY;

  if (hasGsap && hasST) gsap.registerPlugin(ScrollTrigger);
  if (hasGsap && hasSplit) gsap.registerPlugin(SplitText);

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /* ---------------------------------------------------------------------
     Loader
     --------------------------------------------------------------------- */

  const loader = $("[data-loader]");
  const loaderCount = $("[data-loader-count]");
  let loaderDone = false;
  let loaderHidden = false;

  function forceHideLoader() {
    if (loaderHidden) return;
    loaderHidden = true;
    loaderDone = true;
    if (loader) loader.style.display = "none";
    body.classList.add("is-loaded");
    if (loaderCount) loaderCount.textContent = "100";
    startPage();
  }

  function hideLoaderNow() {
    forceHideLoader();
  }

  function finishLoader() {
    if (loaderDone) return;
    if (reduce || !hasGsap || !loader) {
      hideLoaderNow();
      return;
    }
    loaderDone = true;

    let visited = false;
    try {
      visited = sessionStorage.getItem("invenio-visited") === "1";
    } catch (err) {
      visited = false;
    }

    const reveal = () => {
      loaderHidden = true;
      startPage();
      loader.style.display = "none";
      body.classList.add("is-loaded");
      try {
        sessionStorage.setItem("invenio-visited", "1");
      } catch (err) {}
    };

    // First visit: a short, cinematic opening. Internal pages: a quick wipe.
    if (visited) {
      if (loaderCount) loaderCount.textContent = "100";
      startPage();
      gsap.to(loader, {
        clipPath: "inset(0 0 100% 0)",
        duration: 0.55,
        ease: "power3.inOut",
        onComplete: () => {
          loaderHidden = true;
          loader.style.display = "none";
          body.classList.add("is-loaded");
        },
      });
      return;
    }

    const counter = { v: 0 };
    const tl = gsap.timeline({ onComplete: reveal });
    tl.to(counter, {
      v: 100,
      duration: 0.7,
      ease: "power2.inOut",
      onUpdate: () => {
        if (loaderCount) {
          loaderCount.textContent = String(Math.round(counter.v)).padStart(2, "0");
        }
      },
    }, 0)
      .fromTo(".loader-inner img", { opacity: 0, y: 14 }, { opacity: 0.9, y: 0, duration: 0.6, ease: "power3.out" }, 0)
      .to(loader, {
        clipPath: "inset(0 0 100% 0)",
        duration: 0.8,
        ease: "power4.inOut",
      }, 0.7);
  }

  function startPage() {
    if (motionStarted) return;
    motionStarted = true;
    if (!hasGsap || reduce) {
      fallbackVisible();
      return;
    }
    try {
      initMotion();
    } catch (err) {
      console.error("Motion failed, showing the static page.", err);
      fallbackVisible();
    }
  }

  function fallbackVisible() {
    if (loader) loader.style.display = "none";
    body.classList.add("is-loaded");
    $$("[data-count]").forEach((el) => {
      el.textContent = Number(el.dataset.count).toLocaleString("en-GB") + (el.dataset.suffix || "");
    });
    $$("[data-reveal], [data-hero-fade], [data-hero-title], [data-split]").forEach((el) => {
      el.style.opacity = "";
      el.style.transform = "";
    });
  }

  /* ---------------------------------------------------------------------
     Smooth scroll
     --------------------------------------------------------------------- */

  function initLenis() {
    if (reduce || !hasLenis || !hasGsap) return;
    lenis = new Lenis({
      lerp: 0.085,
      wheelMultiplier: 0.92,
      touchMultiplier: 1.5,
      smoothWheel: true,
      syncTouch: false,
    });
    lenis.on("scroll", () => {
      if (hasST) ScrollTrigger.update();
    });
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  function scrollToTarget(target) {
    if (lenis) {
      lenis.scrollTo(target, { offset: -84, duration: 1.4 });
    } else {
      const top = target.getBoundingClientRect().top + window.scrollY - 84;
      window.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
    }
  }

  /* ---------------------------------------------------------------------
     Header
     --------------------------------------------------------------------- */

  function initHeader() {
    const head = $("[data-head]");
    if (!head) return;
    const over = head.classList.contains("head--over");
    const logo = $(".brand-logo", head);
    let lastY = window.scrollY;
    let ticking = false;

    function update() {
      const y = window.scrollY;
      const solid = y > 50;
      head.classList.toggle("is-solid", solid);
      if (over && logo) {
        logo.src = solid ? logo.dataset.logoDark : logo.dataset.logoLight;
      }
      if (y > 280 && y > lastY + 4 && !body.classList.contains("nav-open")) {
        head.classList.add("is-hidden");
      } else if (y < lastY - 4 || y < 120) {
        head.classList.remove("is-hidden");
      }
      lastY = y;
      ticking = false;
    }

    window.addEventListener("scroll", () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }, { passive: true });
    update();
  }

  /* ---------------------------------------------------------------------
     Menu
     --------------------------------------------------------------------- */

  function initMenu() {
    const panel = $("[data-menu-panel]");
    const openBtn = $("[data-menu-open]");
    const closeBtn = $("[data-menu-close]");
    const head = $("[data-head]");
    if (!panel || !openBtn) return;
    let lastFocus = null;

    function animateIn() {
      if (!hasGsap) return;
      gsap.fromTo($$(".menu-nav a", panel), { y: 44, opacity: 0 }, {
        y: 0,
        opacity: 1,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.055,
        delay: 0.32,
      });
      gsap.fromTo($$(".menu-aside, .menu-foot", panel), { opacity: 0 }, {
        opacity: 1,
        duration: 0.8,
        delay: 0.55,
      });
    }

    function open() {
      lastFocus = doc.activeElement;
      panel.classList.add("is-open");
      panel.setAttribute("aria-hidden", "false");
      body.classList.add("nav-open");
      body.classList.add("is-locked");
      openBtn.setAttribute("aria-expanded", "true");
      if (head) head.classList.add("is-open");
      if (lenis) lenis.stop();
      animateIn();
      const first = $(".menu-nav a", panel);
      if (first) setTimeout(() => first.focus(), reduce ? 0 : 550);
    }

    function close(returnFocus = true) {
      panel.classList.remove("is-open");
      panel.setAttribute("aria-hidden", "true");
      body.classList.remove("nav-open");
      body.classList.remove("is-locked");
      openBtn.setAttribute("aria-expanded", "false");
      if (head) head.classList.remove("is-open");
      if (lenis) lenis.start();
      if (returnFocus && lastFocus) lastFocus.focus();
    }

    openBtn.addEventListener("click", open);
    if (closeBtn) closeBtn.addEventListener("click", () => close());
    $$("[data-menu-link]", panel).forEach((a) => a.addEventListener("click", () => close(false)));

    doc.addEventListener("keydown", (e) => {
      if (!panel.classList.contains("is-open")) return;
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = $$('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])', panel)
        .filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && doc.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && doc.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  /* ---------------------------------------------------------------------
     Cursor + floating preview
     --------------------------------------------------------------------- */

  function initCursor() {
    if (!fine || reduce) return;
    const cursor = $("[data-cursor]");
    const label = $("[data-cursor-label]");
    if (!cursor || !hasGsap) return;
    cursor.classList.add("is-hidden");
    gsap.set(cursor, { xPercent: -50, yPercent: -50 });
    const xTo = gsap.quickTo(cursor, "x", { duration: 0.28, ease: "power3" });
    const yTo = gsap.quickTo(cursor, "y", { duration: 0.28, ease: "power3" });

    window.addEventListener("mousemove", (e) => {
      cursor.classList.remove("is-hidden");
      xTo(e.clientX);
      yTo(e.clientY);
    }, { passive: true });
    doc.addEventListener("mouseleave", () => cursor.classList.add("is-hidden"));

    doc.addEventListener("mouseover", (e) => {
      const target = e.target.closest("a, button, [data-cursor]");
      if (!target) {
        cursor.classList.remove("is-view", "is-hover");
        if (label) label.textContent = "";
        return;
      }
      const custom = target.getAttribute("data-cursor");
      if (custom) {
        cursor.classList.add("is-view");
        cursor.classList.remove("is-hover");
        if (label) label.textContent = custom;
      } else {
        cursor.classList.remove("is-view");
        cursor.classList.add("is-hover");
        if (label) label.textContent = "";
      }
    });

    // Floating image on collection rows
    const preview = $("[data-hover-preview]");
    if (preview) {
      let img = null;
      gsap.set(preview, { xPercent: -50, yPercent: -50, scale: 0.92 });
      const px = gsap.quickTo(preview, "x", { duration: 0.55, ease: "power3" });
      const py = gsap.quickTo(preview, "y", { duration: 0.55, ease: "power3" });
      $$(".coll-row[data-preview]").forEach((row) => {
        row.addEventListener("mouseenter", () => {
          const src = row.getAttribute("data-preview");
          if (!src) return;
          if (!img) {
            img = doc.createElement("img");
            img.alt = "";
            preview.appendChild(img);
          }
          img.src = src;
          preview.classList.add("is-on");
          gsap.to(preview, { scale: 1, duration: 0.4, ease: "power3.out" });
        });
        row.addEventListener("mousemove", (e) => {
          px(e.clientX + 30);
          py(e.clientY);
        });
        row.addEventListener("mouseleave", () => {
          preview.classList.remove("is-on");
          gsap.to(preview, { scale: 0.92, duration: 0.3, ease: "power2.out" });
        });
      });
    }
  }

  /* ---------------------------------------------------------------------
     Marquee
     --------------------------------------------------------------------- */

  function initMarquee() {
    if (!hasGsap) return;
    $$("[data-marquee]").forEach((marquee) => {
      $$("[data-marquee-track]", marquee).forEach((track) => {
        if (track.dataset.marqueeReady) return;
        track.dataset.marqueeReady = "1";
        const reverse = track.dataset.direction === "-1";
        const duration = Math.max(18, Math.min(55, track.scrollWidth / 70));
        if (reverse) {
          gsap.set(track, { xPercent: -50 });
          gsap.to(track, { xPercent: 0, duration, ease: "none", repeat: -1 });
        } else {
          gsap.to(track, { xPercent: -50, duration, ease: "none", repeat: -1 });
        }
      });
    });
  }

  /* ---------------------------------------------------------------------
     Motion: splits, reveals, parallax, counters
     --------------------------------------------------------------------- */

  function splitLines(el) {
    if (!el || !hasSplit || el.dataset.splitDone) return null;
    try {
      const lines = new SplitText(el, {
        type: "lines",
        linesClass: "split-line",
        mask: "lines",
      }).lines;
      el.dataset.splitDone = "1";
      return lines;
    } catch (err) {
      return null;
    }
  }

  function initMotion() {
    initHero();
    initReveals();
    initImages();
    initCounters();
    initFooter();
    if (hasST) setTimeout(() => ScrollTrigger.refresh(), 400);
  }

  function initHero() {
    const hero = $("[data-hero]");
    const pageHero = $("[data-hero-media]");
    if (hero) {
      const media = $("[data-hero-media]", hero);
      const img = $("[data-hero-img]", hero);
      const title = $("[data-hero-title]", hero);
      const lines = splitLines(title);
      if (lines) gsap.set(lines, { yPercent: 116 });
      if (media) gsap.set(media, { clipPath: "inset(0 0 100% 0)" });
      if (img) gsap.set(img, { scale: 1.13 });
      const fades = $$("[data-hero-fade]", hero);
      if (fades.length) gsap.set(fades, { opacity: 0, y: 24 });
      const tl = gsap.timeline({ defaults: { ease: "power4.out" } });
      if (media) {
        tl.to(media, { clipPath: "inset(0 0 0% 0)", duration: 1.35, ease: "power4.inOut" }, 0);
      }
      if (img) {
        tl.to(img, { scale: 1, duration: 1.7, ease: "power3.out" }, 0.05);
      }
      if (lines) {
        tl.to(lines, { yPercent: 0, duration: 1.2, stagger: 0.085 }, 0.45);
      }
      if (fades.length) {
        tl.to(fades, { y: 0, opacity: 1, duration: 0.9, stagger: 0.09, ease: "power3.out" }, 0.8);
      }
      if (img) {
        gsap.to(img, {
          yPercent: 9,
          ease: "none",
          scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true },
        });
      }
      const inner = $(".hero-inner", hero);
      if (inner) {
        gsap.to(inner, {
          yPercent: -6,
          opacity: 0.25,
          ease: "none",
          scrollTrigger: { trigger: hero, start: "20% top", end: "bottom top", scrub: true },
        });
      }
      return;
    }

    // Interior pages with a photographic hero
    if (pageHero) {
      const img = $("[data-hero-img]", pageHero);
      const title = $("[data-hero-title]");
      const lines = splitLines(title);
      if (lines) gsap.set(lines, { yPercent: 112 });
      gsap.set(pageHero, { clipPath: "inset(0 0 100% 0)" });
      if (img) gsap.set(img, { scale: 1.08 });
      const tl = gsap.timeline({ defaults: { ease: "power4.out" } });
      tl.to(pageHero, { clipPath: "inset(0 0 0% 0)", duration: 1.25, ease: "power4.inOut" }, 0)
        .to(img, { scale: 1, duration: 1.5, ease: "power3.out" }, 0.05)
        .to(lines || [], { yPercent: 0, duration: 1.1, stagger: 0.08 }, 0.35);
      if (img) {
        gsap.to(img, {
          yPercent: 7,
          ease: "none",
          scrollTrigger: { trigger: pageHero, start: "top bottom", end: "bottom top", scrub: true },
        });
      }
    }

    // Split every non-hero heading
    $$("[data-split]").forEach((el) => {
      if (el.closest("[data-hero]") || el.matches("[data-hero-title]")) return;
      const lines = splitLines(el);
      if (!lines) return;
      gsap.set(lines, { yPercent: 110 });
      gsap.to(lines, {
        yPercent: 0,
        duration: 1.15,
        ease: "power4.out",
        stagger: 0.06,
        scrollTrigger: { trigger: el, start: "top 90%", once: true },
      });
    });
  }

  function initReveals() {
    $$("[data-reveal]").forEach((el) => {
      if (el.closest("[data-hero]")) return;
      if (el.closest("[data-reveal]") && el.parentElement.closest("[data-reveal]")) return;
      gsap.fromTo(el, { y: 26, opacity: 0 }, {
        y: 0,
        opacity: 1,
        duration: 0.95,
        ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 92%", once: true },
      });
    });
  }

  function initImages() {
    $$("[data-img]").forEach((wrapper) => {
      if (wrapper.closest("[data-hero]")) return;
      const rect = wrapper.getBoundingClientRect();
      const alreadyVisible = rect.top < window.innerHeight * 0.9;
      gsap.set(wrapper, { clipPath: "inset(0 0 100% 0)" });
      gsap.to(wrapper, {
        clipPath: "inset(0 0 0% 0)",
        duration: 1.25,
        ease: "power4.inOut",
        delay: alreadyVisible ? 0.15 : 0,
        scrollTrigger: alreadyVisible ? undefined : { trigger: wrapper, start: "top 88%", once: true },
      });
    });

    $$("[data-parallax]").forEach((image) => {
      if (image.closest("[data-hero]") || image.closest("[data-hero-media]")) return;
      const parent = image.parentElement;
      gsap.set(image, { scale: 1.12 });
      gsap.fromTo(image, { yPercent: -5 }, {
        yPercent: 5,
        ease: "none",
        scrollTrigger: { trigger: parent, start: "top bottom", end: "bottom top", scrub: true },
      });
    });
  }

  function initCounters() {
    $$("[data-count]").forEach((el) => {
      const target = Number(el.getAttribute("data-count")) || 0;
      const suffix = el.getAttribute("data-suffix") || "";
      const render = (value) => {
        el.textContent = Math.round(value).toLocaleString("en-GB") + suffix;
      };
      const obj = { v: 0 };
      gsap.to(obj, {
        v: target,
        duration: 2.1,
        ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 92%", once: true },
        onUpdate: () => render(obj.v),
        onComplete: () => render(target),
      });
    });
  }

  function initFooter() {
    const mark = $(".foot-mark img");
    if (!mark) return;
    gsap.fromTo(mark, { yPercent: 12 }, {
      yPercent: -6,
      ease: "none",
      scrollTrigger: { trigger: mark, start: "top bottom", end: "bottom bottom", scrub: true },
    });
  }

  /* ---------------------------------------------------------------------
     Testimonial slider
     --------------------------------------------------------------------- */

  function initSlider() {
    const viewport = $("[data-slider]");
    const track = $("[data-slider-track]");
    if (!viewport || !track) return;
    const slides = $$("[data-slide]", track);
    const prev = $("[data-slider-prev]");
    const next = $("[data-slider-next]");
    const progress = $("[data-slider-progress]");
    if (!slides.length) return;

    let index = 0;
    let dragging = false;
    let startX = 0;
    let startOffset = 0;
    let moved = 0;

    const perView = () => (window.innerWidth >= 1100 ? 2 : 1);
    const maxIndex = () => Math.max(0, slides.length - perView());

    function offsetFor(i) {
      const trackLeft = track.getBoundingClientRect().left;
      const slideLeft = slides[i].getBoundingClientRect().left;
      return slideLeft - trackLeft;
    }

    function render(animate = true) {
      index = Math.max(0, Math.min(index, maxIndex()));
      const x = offsetFor(index);
      track.style.transition = animate ? "transform .8s cubic-bezier(.22,1,.36,1)" : "none";
      track.style.transform = `translate3d(${-x}px,0,0)`;
      if (prev) prev.disabled = index <= 0;
      if (next) next.disabled = index >= maxIndex();
      if (progress) {
        const pct = ((index + Math.min(perView(), slides.length)) / slides.length) * 100;
        progress.style.width = Math.min(100, pct) + "%";
      }
    }

    function go(delta) {
      index += delta;
      render(true);
    }

    if (prev) prev.addEventListener("click", () => go(-1));
    if (next) next.addEventListener("click", () => go(1));

    viewport.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragging = true;
      moved = 0;
      startX = e.clientX;
      startOffset = offsetFor(index);
      track.style.transition = "none";
      viewport.classList.add("is-dragging");
      try { viewport.setPointerCapture(e.pointerId); } catch (err) {}
    });
    viewport.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const delta = e.clientX - startX;
      moved = delta;
      track.style.transform = `translate3d(${-(startOffset - delta)}px,0,0)`;
    });
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      viewport.classList.remove("is-dragging");
      const slideWidth = slides[0].getBoundingClientRect().width || 1;
      const shift = Math.round(-moved / slideWidth);
      if (Math.abs(moved) > 30) index += shift;
      render(true);
    };
    viewport.addEventListener("pointerup", endDrag);
    viewport.addEventListener("pointercancel", endDrag);
    viewport.addEventListener("pointerleave", () => { if (dragging) endDrag(); });

    viewport.setAttribute("tabindex", "0");
    viewport.setAttribute("aria-label", "Testimonials — use the arrow keys to browse");
    viewport.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    });

    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => render(false), 180);
    });
    render(false);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(() => render(false));
  }

  /* ---------------------------------------------------------------------
     Collection filters
     --------------------------------------------------------------------- */

  function initFilters() {
    const grid = $("[data-villa-grid]");
    if (!grid) return;
    const buttons = $$("[data-filter]");
    const cards = $$(".villa-card", grid);
    const count = $("[data-filter-count]");
    const empty = $("[data-empty]");

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const filter = btn.getAttribute("data-filter");
        buttons.forEach((b) => {
          const active = b === btn;
          b.classList.toggle("is-active", active);
          b.setAttribute("aria-pressed", active ? "true" : "false");
        });
        let shown = 0;
        cards.forEach((card) => {
          const visible = filter === "all" || card.getAttribute("data-destination") === filter;
          card.hidden = !visible;
          card.style.display = visible ? "" : "none";
          if (visible) {
            shown += 1;
            if (hasGsap && !reduce) {
              gsap.fromTo(card, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" });
            }
          }
        });
        if (count) count.textContent = shown + (shown === 1 ? " house" : " houses");
        if (empty) empty.hidden = shown !== 0;
        if (hasST) ScrollTrigger.refresh();
      });
    });
  }

  /* ---------------------------------------------------------------------
     Lightbox
     --------------------------------------------------------------------- */

  function initLightbox() {
    const panel = $("[data-lightbox-panel]");
    if (!panel) return;
    const image = $("[data-lightbox-img]", panel);
    const close = $("[data-lightbox-close]", panel);
    let lastFocus = null;

    function open(src, alt) {
      lastFocus = doc.activeElement;
      image.src = src;
      image.alt = alt || "";
      panel.classList.add("is-open");
      panel.setAttribute("aria-hidden", "false");
      body.classList.add("is-locked");
      if (lenis) lenis.stop();
      if (close) close.focus();
    }
    function shut() {
      panel.classList.remove("is-open");
      panel.setAttribute("aria-hidden", "true");
      body.classList.remove("is-locked");
      if (lenis) lenis.start();
      if (lastFocus) lastFocus.focus();
    }

    $$("[data-lightbox]").forEach((btn) => {
      btn.addEventListener("click", () => open(btn.getAttribute("data-lightbox"), btn.querySelector("img")?.alt));
    });
    if (close) close.addEventListener("click", shut);
    panel.addEventListener("click", (e) => { if (e.target === panel) shut(); });
    doc.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && panel.classList.contains("is-open")) shut();
    });
  }

  /* ---------------------------------------------------------------------
     Forms
     --------------------------------------------------------------------- */

  function formValues(form) {
    const data = new FormData(form);
    return Array.from(data.entries())
      .filter(([, value]) => String(value).trim() !== "")
      .map(([key, value]) => key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) + ": " + value)
      .join("\n");
  }

  function openMail(form, subject, status) {
    const email = form.getAttribute("data-email") || "find@inveniohomes.com";
    const body = formValues(form) + "\n\n— Sent from inveniohomes.com";
    const href = "mailto:" + email + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    if (status) status.textContent = "Your email app will open with the enquiry ready to send.";
    window.location.href = href;
  }

  function initForms() {
    $$("[data-enquiry-form]").forEach((form) => {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!form.reportValidity()) return;
        openMail(form, form.getAttribute("data-subject") || "Villa enquiry", null);
        const btn = form.querySelector("button");
        if (btn) {
          const old = btn.innerHTML;
          btn.innerHTML = "Opening email…";
          setTimeout(() => { btn.innerHTML = old; }, 2400);
        }
      });
    });

    const form = $("[data-contact-form]");
    if (form) {
      // Pre-select a subject from ?subject=...
      const params = new URLSearchParams(window.location.search);
      const wanted = params.get("subject");
      const select = form.querySelector('select[name="subject"]');
      if (wanted && select) {
        const match = Array.from(select.options).find((o) => o.text.toLowerCase() === wanted.toLowerCase());
        if (match) select.value = match.value;
        else {
          const opt = doc.createElement("option");
          opt.textContent = wanted;
          select.appendChild(opt);
          select.value = wanted;
        }
      }
      const status = $("[data-form-status]", form.parentElement) || $("[data-form-status]");

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!form.reportValidity()) return;
        const endpoint = form.getAttribute("data-endpoint");
        const submit = form.querySelector('button[type="submit"]');
        const original = submit ? submit.innerHTML : "";
        if (submit) { submit.disabled = true; submit.innerHTML = "Sending…"; }
        if (status) status.textContent = "";

        if (!endpoint) {
          openMail(form, form.querySelector('[name="subject"]')?.value || "Website enquiry", status);
          if (submit) { submit.disabled = false; submit.innerHTML = original; }
          return;
        }

        try {
          const res = await fetch(endpoint, {
            method: "POST",
            body: new FormData(form),
            headers: { Accept: "application/json" },
          });
          if (!res.ok) throw new Error("Request failed");
          form.reset();
          if (status) status.textContent = form.getAttribute("data-success") || "Thank you — we will be in touch.";
        } catch (err) {
          if (status) {
            status.textContent = "Something went wrong. Please email find@inveniohomes.com directly.";
          }
        } finally {
          if (submit) { submit.disabled = false; submit.innerHTML = original; }
        }
      });
    }
  }

  /* ---------------------------------------------------------------------
     Magnetic buttons
     --------------------------------------------------------------------- */

  function initMagnetic() {
    if (!fine || reduce || !hasGsap) return;
    $$(".btn").forEach((btn) => {
      btn.addEventListener("mousemove", (e) => {
        const rect = btn.getBoundingClientRect();
        const x = (e.clientX - rect.left - rect.width / 2) * 0.14;
        const y = (e.clientY - rect.top - rect.height / 2) * 0.14;
        gsap.to(btn, { x, y, duration: 0.4, ease: "power2.out" });
      });
      btn.addEventListener("mouseleave", () => {
        gsap.to(btn, { x: 0, y: 0, duration: 0.6, ease: "elastic.out(1, 0.5)" });
      });
    });
  }

  /* ---------------------------------------------------------------------
     Page transitions
     --------------------------------------------------------------------- */

  function initTransitions() {
    if (!hasGsap || reduce) return;
    doc.addEventListener("click", (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      if (a.target || a.hasAttribute("download") || a.hasAttribute("data-no-transition")) return;
      let next;
      try { next = new URL(a.href, window.location.href); } catch (err) { return; }
      if (next.origin !== window.location.origin) return;
      if (next.pathname === window.location.pathname && next.search === window.location.search) return;
      if (!loader) return;
      e.preventDefault();
      body.classList.add("is-locked");
      if (lenis) lenis.stop();
      loader.style.display = "flex";
      loader.style.clipPath = "inset(100% 0 0 0)";
      gsap.to(loader, {
        clipPath: "inset(0% 0 0 0)",
        duration: 0.55,
        ease: "power4.inOut",
        onComplete: () => { window.location.href = next.href; },
      });
      setTimeout(() => { if (window.location.href !== next.href) window.location.href = next.href; }, 900);
    });

    window.addEventListener("pageshow", (e) => {
      if (e.persisted) {
        if (loader) loader.style.display = "none";
        body.classList.remove("is-locked");
        body.classList.add("is-loaded");
        if (lenis) lenis.start();
        startPage();
      }
    });
  }

  /* ---------------------------------------------------------------------
     Anchor links
     --------------------------------------------------------------------- */

  function initAnchors() {
    doc.addEventListener("click", (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute("href");
      if (!id || id === "#") return;
      const target = doc.querySelector(id);
      if (!target) return;
      e.preventDefault();
      scrollToTarget(target);
    });
  }

  /* ---------------------------------------------------------------------
     Boot
     --------------------------------------------------------------------- */

  function boot() {
    initLenis();
    initHeader();
    initMenu();
    initCursor();
    initMarquee();
    initSlider();
    initFilters();
    initLightbox();
    initForms();
    initMagnetic();
    initTransitions();
    initAnchors();

    const fonts = doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve();
    const minimum = reduce ? 0 : 200;
    Promise.race([fonts, wait(1200)]).then(() => wait(minimum)).then(finishLoader);
    // Safety net: never leave the cover on screen.
    setTimeout(hideLoaderNow, 6000);
  }

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
