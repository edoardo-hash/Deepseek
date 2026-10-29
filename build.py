#!/usr/bin/env python3
"""
Invenio Homes — static site builder.

Reads everything in content/ and writes a complete, dependency-free site to dist/.
No frameworks, no database, no WordPress. Run with:

    python3 build.py

The Studio (node server.mjs) calls this after every save.
"""

from __future__ import annotations

import html
import json
import os
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / "content"
DIST = ROOT / "dist"
ASSETS = ROOT / "assets"
# --------------------------------------------------------------------------- #
#  Data
# --------------------------------------------------------------------------- #


def load(name: str):
    with open(CONTENT / name, encoding="utf-8") as fh:
        return json.load(fh)


SETTINGS = load("settings.json")
SITE = SETTINGS["site"]
SITE_URL = (os.environ.get("SITE_URL") or SITE.get("url") or "https://inveniohomes.com").rstrip("/")
NAV = SETTINGS["nav"]
FOOTER = SETTINGS["footer"]
HOME = load("home.json")
VILLAS = load("villas.json")
DESTINATIONS = load("destinations.json")
TESTIMONIALS = load("testimonials.json")
TEAM = load("team.json")
PAGES = {
    "owners": load("pages/owners.json"),
    "platform": load("pages/platform.json"),
    "about": load("pages/about.json"),
    "contact": load("pages/contact.json"),
    "collection": load("pages/collection.json"),
    "destinations": load("pages/destinations.json"),
    "legal": load("pages/legal.json"),
}

DEST_BY_SLUG = {d["slug"]: d for d in DESTINATIONS}
VILLA_BY_SLUG = {v["slug"]: v for v in VILLAS}


# --------------------------------------------------------------------------- #
#  Text helpers
# --------------------------------------------------------------------------- #


def e(value) -> str:
    """Escape for HTML."""
    return html.escape(str(value if value is not None else ""), quote=True)


def inline(text: str) -> str:
    """Escape, then allow *italic* and **bold** — the only markup editors need."""
    raw = html.escape(str(text or ""), quote=False)
    raw = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", raw)
    raw = re.sub(r"\*(.+?)\*", r"<em>\1</em>", raw)
    return raw


def para(text: str, cls: str = "") -> str:
    """Turn blank-line-separated text into paragraphs, allowing inline emphasis."""
    chunks = [c.strip() for c in str(text or "").split("\n\n") if c.strip()]
    if not chunks:
        return ""
    klass = f' class="{cls}"' if cls else ""
    return "".join(f"<p{klass}>{inline(c).replace(chr(10), '<br>')}</p>" for c in chunks)


def money(value: int) -> str:
    return f"€{value:,.0f}".replace(",", ",")


def url(path: str) -> str:
    if not path:
        return "/"
    if path.startswith(("http://", "https://", "mailto:", "tel:", "#")):
        return path
    return path


def ext_url(path: str) -> bool:
    return str(path).startswith(("http://", "https://"))


def src(name: str, width: int = 1600) -> str:
    """Resolve a content image reference to a generated file."""
    name = str(name or "").strip()
    if not name:
        return "/assets/img/placeholder-1600.jpg"
    if name.startswith("/"):
        return name
    if name.endswith((".jpg", ".jpeg", ".png", ".svg", ".webp")):
        if name.startswith("assets/"):
            return "/" + name
        return "/assets/img/" + name
    candidate = ASSETS / "img" / f"{name}-{width}.jpg"
    if candidate.exists():
        return f"/assets/img/{name}-{width}.jpg"
    for fallback in (2400, 1600, 960, 480):
        if (ASSETS / "img" / f"{name}-{fallback}.jpg").exists():
            return f"/assets/img/{name}-{fallback}.jpg"
    return f"/assets/img/{name}.jpg"


def srcset(name: str) -> str:
    name = str(name or "").strip()
    if not name or name.startswith("/") or "." in name:
        return ""
    parts = []
    for width in (480, 960, 1600, 2400):
        if (ASSETS / "img" / f"{name}-{width}.jpg").exists():
            parts.append(f"/assets/img/{name}-{width}.jpg {width}w")
    return ", ".join(parts)


def img(
    name: str,
    alt: str = "",
    *,
    cls: str = "",
    sizes: str = "100vw",
    eager: bool = False,
    width: int = 1600,
    height: int = 1000,
    extra: str = "",
) -> str:
    ss = srcset(name)
    attrs = [
        f'src="{e(src(name, width))}"',
        f'alt="{e(alt)}"',
        f'width="{width}"',
        f'height="{height}"',
        f'decoding="{"sync" if eager else "async"}"',
        f'loading="{"eager" if eager else "lazy"}"',
    ]
    if ss:
        attrs.append(f'srcset="{e(ss)}"')
        attrs.append(f'sizes="{e(sizes)}"')
    if cls:
        attrs.append(f'class="{e(cls)}"')
    if extra:
        attrs.append(extra)
    return "<img " + " ".join(attrs) + ">"


def link(path: str, label: str, cls: str = "", attrs: str = "") -> str:
    target = url(path)
    external = ext_url(target)
    ext = ' target="_blank" rel="noopener"' if external else ""
    klass = f' class="{e(cls)}"' if cls else ""
    return f'<a href="{e(target)}"{klass}{ext} {attrs}>{label}</a>'


def section_head(eyebrow="", title="", body="", *, light=False, split=False, link_label="", link_href=""):
    cls = "sec-head"
    if split:
        cls += " sec-head--split"
    if light:
        cls += " sec-head--light"
    out = [f'<div class="{cls}">']
    if eyebrow:
        out.append(f'<p class="eyebrow" data-reveal>{inline(eyebrow)}</p>')
    if title:
        out.append(f'<h2 class="display" data-split>{inline(title)}</h2>')
    if body:
        out.append(f'<p class="sec-body" data-reveal>{inline(body)}</p>')
    if link_label:
        out.append(
            f'<div class="sec-link" data-reveal><a class="link-arrow" href="{e(link_href)}">{inline(link_label)} '
            f'<span class="arw" aria-hidden="true">→</span></a></div>'
        )
    out.append("</div>")
    return "".join(out)


# --------------------------------------------------------------------------- #
#  Shell
# --------------------------------------------------------------------------- #

FAVICON = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" fill="#244635"/>
<path d="M18 17h5v30h-5zM27 17h5v30h-5zM36 17h5l5 30h-5z" fill="#F2EDE3"/>
</svg>"""

ORG_JSONLD = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": SITE["name"],
    "url": SITE_URL,
    "logo": SITE_URL + "/assets/img/logo.svg",
    "email": SITE["email"],
    "telephone": SITE["phone"],
    "address": {"@type": "PostalAddress", "addressLocality": SITE["address"], "addressCountry": "ES"},
    "sameAs": [SITE["instagram"], SITE["linkedin"], SITE["facebook"]],
}


def header(active: str = "", over: bool = False) -> str:
    nav_items = []
    for item in NAV:
        href = item["href"]
        is_active = href == active or (href != "/" and active.startswith(href))
        current = ' aria-current="page"' if is_active else ""
        nav_items.append(f'<a href="{e(href)}"{current}>{e(item["label"])}</a>')
    over_cls = " head--over" if over else ""
    return f"""
<header class="site-head{over_cls}" data-head>
  <div class="head-inner">
    <a class="brand" href="/" aria-label="Invenio Homes — home">
      <img class="brand-logo" src="{e(SITE['logoLight'] if over else SITE['logo'])}" alt="Invenio Homes" data-logo-light="{e(SITE['logoLight'])}" data-logo-dark="{e(SITE['logo'])}" width="150" height="37">
    </a>
    <nav class="nav-desktop" aria-label="Primary">
      {''.join(nav_items)}
    </nav>
    <div class="head-actions">
      <a class="head-signin" href="{e(SITE['signinUrl'])}">Sign in</a>
      <a class="btn btn--ink btn--sm" href="/contact/">Enquire <span class="arw" aria-hidden="true">→</span></a>
      <button class="menu-btn" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="menu-panel" data-menu-open>
        <span></span><span></span>
      </button>
    </div>
  </div>
</header>

<div class="menu-panel" id="menu-panel" role="dialog" aria-modal="true" aria-label="Menu" aria-hidden="true" data-menu-panel>
  <div class="menu-top">
    <a class="brand" href="/" aria-label="Invenio Homes — home" data-menu-link>
      <img class="brand-logo" src="{e(SITE['logoLight'])}" alt="Invenio Homes" width="150" height="37">
    </a>
    <button class="menu-close" type="button" aria-label="Close menu" data-menu-close><span></span><span></span></button>
  </div>
  <div class="menu-body">
    <nav class="menu-nav" aria-label="Menu">
      {''.join(
        f'<a href="{e(i["href"])}" data-menu-link><span class="menu-num">0{n}</span><span>{e(i["label"])}</span><span class="menu-arw" aria-hidden="true">↗</span></a>'
        for n, i in enumerate(NAV + [{"label": "Contact", "href": "/contact/"}], start=1)
      )}
    </nav>
    <div class="menu-aside">
      <p class="menu-label">Talk to us</p>
      <a class="menu-email" href="mailto:{e(SITE['email'])}">{e(SITE['email'])}</a>
      <a href="tel:{e(SITE['phoneHref'])}">{e(SITE['phone'])}</a>
      <p class="menu-label">Follow</p>
      <div class="menu-social">
        <a href="{e(SITE['instagram'])}" target="_blank" rel="noopener">Instagram</a>
        <a href="{e(SITE['linkedin'])}" target="_blank" rel="noopener">LinkedIn</a>
      </div>
      <p class="menu-note">Ibiza · Formentera · Mykonos · Bali</p>
    </div>
  </div>
  <div class="menu-foot">
    <span>{e(SITE['coordinates'])}</span>
    <span>{e(SITE['address'])}</span>
    <a href="mailto:{e(SITE['email'])}">{e(SITE['email'])}</a>
    <a href="https://wa.me/{e(SITE['whatsapp'])}" target="_blank" rel="noopener">WhatsApp</a>
    <a href="/contact/">Enquire</a>
  </div>
</div>
"""


def footer() -> str:
    cols = []
    for col in FOOTER["columns"]:
        links = "".join(f'<a href="{e(l["href"])}">{e(l["label"])}</a>' for l in col["links"])
        cols.append(f'<div class="foot-col"><h3>{e(col["title"])}</h3>{links}</div>')
    socials = "".join(
        f'<a href="{e(u)}" target="_blank" rel="noopener">{label}</a>'
        for u, label in ((SITE["instagram"], "Instagram"), (SITE["linkedin"], "LinkedIn"), (SITE["facebook"], "Facebook"))
    )
    legal = " · ".join(f'<a href="{e(l["href"])}">{e(l["label"])}</a>' for l in FOOTER["legalLinks"])
    return f"""
<footer class="site-foot">
  <div class="wrap">
    <div class="foot-top">
      <div class="foot-brand">
        <img class="foot-logo" src="{e(SITE['logoLight'])}" alt="Invenio Homes" width="180" height="44">
        <p>{e(FOOTER['statement'])}</p>
      </div>
      <div class="foot-cols">{''.join(cols)}</div>
      <div class="foot-col foot-contact">
        <h3>Talk to us</h3>
        <a href="mailto:{e(SITE['email'])}">{e(SITE['email'])}</a>
        <a href="tel:{e(SITE['phoneHref'])}">{e(SITE['phone'])}</a>
        <a href="https://wa.me/{e(SITE['whatsapp'])}" target="_blank" rel="noopener">WhatsApp</a>
        <p>{e(SITE['address'])}</p>
        <div class="foot-social">{socials}</div>
      </div>
    </div>
    <div class="foot-mark" aria-hidden="true">
      <img src="{e(SITE['logoLight'])}" alt="" width="1200" height="292">
    </div>
    <div class="foot-base">
      <p>{e(SITE['copyright'])}</p>
      <p class="foot-legal-links">{legal}</p>
      <p>{e(SITE['legalName'])} · {e(SITE['taxId'])}</p>
    </div>
    <p class="foot-credit">{e(FOOTER['photoCredit'])}</p>
  </div>
</footer>
"""


def compare_switch() -> str:
    """Floating switch to jump to the same page on the other site build."""
    cfg = SETTINGS.get("compare") or {}
    if not cfg.get("enabled") or not cfg.get("otherUrl"):
        return ""
    other = str(cfg["otherUrl"]).rstrip("/")
    return f"""<div class="compare" data-compare aria-label="Compare site versions" role="group">
  <span class="compare-label">Compare</span>
  <span class="compare-opt is-on" aria-current="true">{e(cfg.get("thisLabel", "This site"))}</span>
  <a class="compare-opt" href="{e(other)}/" data-compare-link data-no-transition>{e(cfg.get("otherLabel", "Other site"))}</a>
</div>
<script>
(function () {{
  var a = document.querySelector("[data-compare-link]");
  if (!a) return;
  var base = {json.dumps(other)};
  // Pages on this site -> matching page on the other site (unmatched -> its home).
  var map = {{ "/about/": "/about", "/owners/": "/owners", "/platform/": "/the-platform" }};
  var p = location.pathname, target = map[p];
  a.href = base + (target || "/");
}})();
</script>"""


def page(
    *,
    title: str,
    description: str,
    body: str,
    active: str,
    page_class: str,
    canonical: str,
    og_image: str = "",
    preload: str = "",
    head_extra: str = "",
    over_header: bool = False,
) -> str:
    if not og_image:
        og_image = SETTINGS["seo"]["ogImage"]
    if not str(og_image).startswith(("http://", "https://", "/")):
        og_image = src(og_image, 1600)
    og = SITE_URL + og_image if og_image.startswith("/") else og_image
    preload_tag = ""
    if preload:
        preload_tag = (
            f'<link rel="preload" as="image" href="{e(src(preload, 1600))}" '
            f'imagesrcset="{e(srcset(preload))}" imagesizes="100vw" fetchpriority="high">'
        )
    jsonld = json.dumps(ORG_JSONLD, ensure_ascii=False)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(description)}">
<link rel="canonical" href="{e(SITE_URL + canonical)}">
<meta name="theme-color" content="{e(SETTINGS['seo']['themeColor'])}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{e(SITE['name'])}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(description)}">
<meta property="og:url" content="{e(SITE_URL + canonical)}">
<meta property="og:image" content="{e(og)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{e(title)}">
<meta name="twitter:description" content="{e(description)}">
<meta name="twitter:image" content="{e(og)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/img/favicon-180.png">
{preload_tag}
<link rel="stylesheet" href="/assets/css/site.css">
<script>document.documentElement.classList.add('js');</script>
<script type="application/ld+json">{jsonld}</script>
{head_extra}
</head>
<body class="page-{e(page_class)}" data-page="{e(page_class)}">
<a class="skip" href="#main">Skip to content</a>
<div class="loader" data-loader aria-hidden="true">
  <div class="loader-inner">
    <img src="{e(SITE['logoLight'])}" alt="" width="210" height="51">
    <div class="loader-meta"><span>Ibiza</span><span data-loader-count>00</span></div>
  </div>
</div>
<div class="cursor" data-cursor aria-hidden="true"><span class="cursor-label" data-cursor-label></span></div>
<div class="hover-preview" data-hover-preview aria-hidden="true"></div>
{header(active, over_header)}
<main id="main">
{body}
</main>
{footer()}
{compare_switch()}
<script src="/assets/js/vendor/gsap.min.js" defer></script>
<script src="/assets/js/vendor/ScrollTrigger.min.js" defer></script>
<script src="/assets/js/vendor/SplitText.min.js" defer></script>
<script src="/assets/js/vendor/lenis.min.js" defer></script>
<script src="/assets/js/site.js" defer></script>
</body>
</html>
"""


# --------------------------------------------------------------------------- #
#  Components
# --------------------------------------------------------------------------- #


def breadcrumbs(items) -> str:
    out = []
    for i, (label, href) in enumerate(items):
        if i:
            out.append('<span class="crumb-sep" aria-hidden="true">/</span>')
        if href:
            out.append(f'<a href="{e(href)}">{e(label)}</a>')
        else:
            out.append(f'<span aria-current="page">{e(label)}</span>')
    return f'<nav class="crumbs" aria-label="Breadcrumb">{"".join(out)}</nav>'


def villa_card(v, index=0) -> str:
    dest = DEST_BY_SLUG.get(v["destination"], {})
    tag = f'<span class="tag">{e(v["tag"])}</span>' if v.get("tag") else ""
    return f"""
<article class="villa-card" data-reveal data-destination="{e(v['destination'])}">
  <a class="villa-card-media" href="/villas/{e(v['slug'])}/" data-cursor="View" aria-label="{e(v['name'])} — view the house">
    {img(v['image'], f"{v['name']}, {v['location']}", sizes="(max-width: 760px) 100vw, 50vw", cls="villa-card-img")}
    {tag}
    <span class="villa-card-index">{index + 1:02d}</span>
  </a>
  <div class="villa-card-body">
    <p class="villa-loc">{e(v['location'])}</p>
    <h3><a href="/villas/{e(v['slug'])}/">{e(v['name'])}</a></h3>
    <p class="villa-facts">{v['bedrooms']} bedrooms · {v['baths']} baths · sleeps {v['sleeps']}</p>
    <div class="villa-foot">
      <span class="villa-price">From {money(v['from'])} <small>/ week</small></span>
      <span class="villa-lic">Lic. {e(v['licence'])}</span>
    </div>
  </div>
</article>"""


def collection_row(v, index=0) -> str:
    return f"""
<a class="coll-row" href="/villas/{e(v['slug'])}/" data-reveal data-preview="{e(src(v['image'], 1600))}" data-cursor="View">
  <span class="coll-index">{index + 1:02d}</span>
  <span class="coll-thumb">{img(v['image'], '', sizes="140px", width=140, height=96)}</span>
  <span class="coll-name">{e(v['name'])}<span class="coll-loc">{e(v['location'])}</span></span>
  <span class="coll-facts">{v['bedrooms']} bed · {v['baths']} bath · {v['sleeps']} guests</span>
  <span class="coll-price">From {money(v['from'])}</span>
  <span class="coll-arw" aria-hidden="true">↗</span>
</a>"""


def dest_card(d, index=0, large=False) -> str:
    cls = "dest-card dest-card--large" if large else "dest-card"
    return f"""
<a class="{cls}" href="/destinations/{e(d['slug'])}/" data-reveal data-cursor="Discover">
  <span class="dest-media">{img(d['image'], f"{d['name']}, {d['country']}", sizes="(max-width: 760px) 100vw, 50vw", cls="dest-img")}</span>
  <span class="dest-body">
    <span class="dest-num">{index + 1:02d} · {e(d['country'])}</span>
    <span class="dest-name">{e(d['name'])}</span>
    <span class="dest-tag">{e(d['tagline'])}</span>
    <span class="dest-arw" aria-hidden="true">→</span>
  </span>
</a>"""


def quote_card(q, index=0) -> str:
    return f"""
<figure class="quote" data-slide>
  <span class="quote-mark" aria-hidden="true">“</span>
  <blockquote>{inline(q['quote'])}</blockquote>
  <figcaption><span>{e(q['name'])}</span><small>{e(q.get('detail', ''))}</small></figcaption>
</figure>"""


def stats_band(data, *, light=False, show_title=True) -> str:
    stats = []
    for s in data["stats"]:
        stats.append(
            f'<div class="stat" data-reveal>'
            f'<span class="stat-num" data-count="{int(s["number"])}" data-suffix="{e(s.get("suffix", ""))}">0</span>'
            f'<span class="stat-label">{inline(s["label"])}</span></div>'
        )
    title = f'<h2 class="display" data-split>{inline(data["title"])}</h2>' if data.get("title") and show_title else ""
    note = f'<p class="stat-note">{e(data["note"])}</p>' if data.get("note") else ""
    cls = "stats-band stats-band--light" if light else "stats-band"
    return f"""
<section class="{cls}">
  <div class="wrap">
    <div class="stats-head" data-reveal>
      <p class="eyebrow">{e(data['eyebrow'])}</p>
      {title}
    </div>
    <div class="stats-grid">{''.join(stats)}</div>
    {note}
  </div>
</section>"""


def cta_band(data) -> str:
    primary = data["primary"]
    secondary = data.get("secondary")
    sec = ""
    if secondary:
        sec = link(secondary["href"], e(secondary["label"]), "btn btn--ghost btn--light")
    return f"""
<section class="cta-band" id="contact-cta">
  <div class="cta-orbit" aria-hidden="true"></div>
  <div class="wrap cta-inner">
    <div data-reveal>
      <p class="eyebrow eyebrow--light">{e(data['eyebrow'])}</p>
      <h2 class="display display--xl" data-split>{inline(data['title'])}</h2>
      <p class="cta-body">{inline(data['body'])}</p>
    </div>
    <div class="cta-actions" data-reveal>
      {link(primary['href'], inline(primary['label']) + ' <span class="arw" aria-hidden="true">→</span>', 'btn btn--paper')}
      {sec}
    </div>
  </div>
</section>"""


# --------------------------------------------------------------------------- #
#  Home
# --------------------------------------------------------------------------- #


def build_home() -> str:
    h = HOME
    hero = h["hero"]
    facts = "".join(
        f'<div class="hero-fact"><span class="hero-fact-num">{e(f["value"])}</span><span class="hero-fact-label">{e(f["label"])}</span></div>'
        for f in hero["facts"]
    )
    intro_images = "".join(
        f'<figure class="intro-img intro-img--{i + 1}" data-img>{img(im["image"], im["alt"], sizes="(max-width: 760px) 50vw, 26vw", extra="data-parallax")}</figure>'
        for i, im in enumerate(h["intro"]["images"])
    )
    rows = "".join(collection_row(VILLA_BY_SLUG[s], i) for i, s in enumerate(h["collection"]["villas"]) if s in VILLA_BY_SLUG)
    dests = DESTINATIONS
    dest_html = (
        dest_card(dests[0], 0, large=True)
        + dest_card(dests[1], 1)
        + dest_card(dests[2], 2)
        + dest_card(dests[3], 3, large=True)
    )
    features = "".join(
        f'<li data-reveal><h3>{e(f["title"])}</h3><p>{e(f["text"])}</p></li>' for f in h["platform"]["features"]
    )
    bullets = "".join(f"<li>{e(b)}</li>" for b in h["owners"]["bullets"])
    quotes = [q for q in TESTIMONIALS["items"] if q.get("featured")][: h["testimonials"].get("limit", 4)]
    slides = "".join(quote_card(q) for q in quotes)

    body = f"""
<section class="hero" data-hero>
  <div class="hero-media" data-hero-media>
    {img(hero['image'], hero['imageAlt'], sizes="100vw", eager=True, width=1800, height=1200, extra="data-hero-img")}
    <span class="hero-grade" aria-hidden="true"></span>
    <p class="hero-caption">{e(hero['caption'])}</p>
  </div>
  <div class="hero-inner wrap">
    <p class="eyebrow eyebrow--light hero-eyebrow" data-hero-fade>{e(hero['eyebrow'])}</p>
    <h1 class="display display--hero" data-hero-title>{inline(hero['title'])}</h1>
    <div class="hero-lower">
      <p class="hero-lede" data-hero-fade>{inline(hero['lede'])}</p>
      <div class="hero-actions" data-hero-fade>
        {link(hero['primary']['href'], inline(hero['primary']['label']) + ' <span class="arw" aria-hidden="true">→</span>', 'btn btn--paper')}
        {link(hero['secondary']['href'], e(hero['secondary']['label']), 'btn btn--ghost btn--light')}
      </div>
    </div>
  </div>
  <div class="hero-foot">
    <div class="wrap hero-facts" data-hero-fade>{facts}</div>
  </div>
  <div class="scroll-cue" aria-hidden="true"><span></span>Scroll</div>
</section>

<section class="section intro">
  <div class="wrap intro-grid">
    <div class="intro-copy">
      <p class="eyebrow" data-reveal>{e(h['intro']['eyebrow'])}</p>
      <h2 class="statement" data-split>{inline(h['intro']['title'])}</h2>
      <div class="intro-body" data-reveal>
        {para(h['intro']['body'])}
        <p class="signature">{e(h['intro']['signature'])}</p>
      </div>
    </div>
    <div class="intro-media">{intro_images}</div>
  </div>
</section>

<div class="marquee" data-marquee aria-hidden="true">
  <div class="marquee-track" data-marquee-track>
    <span>{e(h['marquee']['lineOne'])}</span><span>{e(h['marquee']['lineOne'])}</span>
  </div>
  <div class="marquee-track marquee-track--outline" data-marquee-track data-direction="-1">
    <span>{e(h['marquee']['lineTwo'])}</span><span>{e(h['marquee']['lineTwo'])}</span>
  </div>
</div>

<section class="section section--collection" id="collection">
  <div class="wrap">
    <div class="sec-head sec-head--split">
      <div>
        <p class="eyebrow" data-reveal>{e(h['collection']['eyebrow'])}</p>
        <h2 class="display" data-split>{inline(h['collection']['title'])}</h2>
      </div>
      <div class="sec-side" data-reveal>
        <p>{inline(h['collection']['body'])}</p>
        <a class="link-arrow" href="{e(h['collection']['linkHref'])}">{e(h['collection']['linkLabel'])} <span class="arw" aria-hidden="true">→</span></a>
      </div>
    </div>
    <div class="coll-list">{rows}</div>
    <div class="coll-foot" data-reveal>
      <a class="btn btn--line" href="{e(h['collection']['linkHref'])}">{e(h['collection']['linkLabel'])} <span class="arw" aria-hidden="true">→</span></a>
      <span>Every house visited · Every licence verified</span>
    </div>
  </div>
</section>

<section class="section section--platform">
  <div class="wrap split split--platform">
    <div class="split-media" data-img>
      {img(h['platform']['image'], h['platform']['imageAlt'], sizes="(max-width: 900px) 100vw, 52vw", extra="data-parallax")}
      <span class="media-badge">Live</span>
    </div>
    <div class="split-copy">
      <p class="eyebrow" data-reveal>{e(h['platform']['eyebrow'])}</p>
      <h2 class="display" data-split>{inline(h['platform']['title'])}</h2>
      <p class="lede" data-reveal>{inline(h['platform']['body'])}</p>
      <ul class="feature-list">{features}</ul>
      <div data-reveal>{link(h['platform']['cta']['href'], inline(h['platform']['cta']['label']) + ' <span class="arw" aria-hidden="true">→</span>', 'btn btn--line')}</div>
    </div>
  </div>
</section>

{stats_band(h['numbers'])}

<section class="section section--destinations">
  <div class="wrap">
    <div class="sec-head sec-head--split">
      <div>
        <p class="eyebrow" data-reveal>{e(h['destinations']['eyebrow'])}</p>
        <h2 class="display" data-split>{inline(h['destinations']['title'])}</h2>
      </div>
      <div class="sec-side" data-reveal>
        <p>{inline(h['destinations']['body'])}</p>
        <a class="link-arrow" href="{e(h['destinations']['linkHref'])}">{e(h['destinations']['linkLabel'])} <span class="arw" aria-hidden="true">→</span></a>
      </div>
    </div>
    <div class="dest-grid">{dest_html}</div>
  </div>
</section>

<section class="section section--owners">
  <div class="wrap split split--reverse">
    <div class="split-media" data-img>
      {img(h['owners']['image'], h['owners']['imageAlt'], sizes="(max-width: 900px) 100vw, 48vw", extra="data-parallax")}
    </div>
    <div class="split-copy">
      <p class="eyebrow" data-reveal>{e(h['owners']['eyebrow'])}</p>
      <h2 class="display" data-split>{inline(h['owners']['title'])}</h2>
      <p class="lede" data-reveal>{inline(h['owners']['body'])}</p>
      <ul class="tick-list">{bullets}</ul>
      <div data-reveal>{link(h['owners']['cta']['href'], inline(h['owners']['cta']['label']) + ' <span class="arw" aria-hidden="true">→</span>', 'btn btn--line')}</div>
    </div>
  </div>
</section>

<section class="section section--quotes">
  <div class="wrap">
    <div class="quotes-head">
      <div>
        <p class="eyebrow" data-reveal>{e(h['testimonials']['eyebrow'])}</p>
        <h2 class="display" data-split>{inline(h['testimonials']['title'])}</h2>
      </div>
      <div class="slider-controls" data-reveal>
        <button class="slider-btn" type="button" aria-label="Previous testimonials" data-slider-prev>←</button>
        <button class="slider-btn" type="button" aria-label="Next testimonials" data-slider-next>→</button>
      </div>
    </div>
  </div>
  <div class="quotes-viewport" data-slider>
    <div class="quotes-track" data-slider-track>{slides}</div>
  </div>
  <div class="wrap quotes-progress"><span data-slider-progress></span></div>
</section>

{cta_band(h['cta'])}
"""
    return page(
        title=h["seo"]["title"],
        description=h["seo"]["description"],
        body=body,
        active="/",
        page_class="home",
        canonical="/",
        og_image=SETTINGS["seo"]["ogImage"],
        preload=hero["image"],
        over_header=True,
        head_extra=f'<meta name="robots" content="index, follow, max-image-preview:large">',
    )


# --------------------------------------------------------------------------- #
#  Villas
# --------------------------------------------------------------------------- #


def build_villas_index() -> str:
    p = PAGES["collection"]
    villas = "".join(villa_card(v, i) for i, v in enumerate(VILLAS))
    filters = ['<button class="filter is-active" type="button" data-filter="all" aria-pressed="true">All islands</button>']
    for d in DESTINATIONS:
        count = len([v for v in VILLAS if v["destination"] == d["slug"]])
        filters.append(
            f'<button class="filter" type="button" data-filter="{e(d["slug"])}" aria-pressed="false">{e(d["name"])} <span>{count}</span></button>'
        )
    body = f"""
<section class="page-hero page-hero--media">
  <div class="wrap page-hero-grid">
    <div>
      {breadcrumbs([("Home", "/"), ("The collection", "")])}
      <p class="eyebrow" data-reveal>{e(p['hero']['eyebrow'])}</p>
      <h1 class="display display--xl" data-split>{inline(p['hero']['title'])}</h1>
      <p class="lede" data-reveal>{inline(p['hero']['lede'])}</p>
    </div>
    <div class="page-hero-media" data-img>{img(p['hero']['image'], p['hero']['imageAlt'], sizes="(max-width: 900px) 100vw, 34vw", extra="data-parallax")}</div>
  </div>
</section>

<section class="section section--tight">
  <div class="wrap">
    <div class="filter-bar" data-reveal>
      <span class="filter-label">{e(p['filterLabel'])}</span>
      <div class="filter-set">{''.join(filters)}</div>
      <span class="filter-count" data-filter-count aria-live="polite">{len(VILLAS)} houses</span>
    </div>
    <div class="villa-grid" data-villa-grid>{villas}</div>
    <p class="empty-state" data-empty hidden>{e(p['empty'])}</p>
    <p class="fine-note" data-reveal>{e(p['note'])}</p>
  </div>
</section>
{cta_band(HOME['cta'])}
"""
    return page(
        title=p["seo"]["title"],
        description=p["seo"]["description"],
        body=body,
        active="/villas/",
        page_class="villas",
        canonical="/villas/",
        og_image=src(p["hero"]["image"], 1600),
        preload=p["hero"]["image"],
    )


def build_villa(v) -> str:
    dest = DEST_BY_SLUG.get(v["destination"], {})
    gallery = "".join(
        f'<button class="gallery-item{" gallery-item--wide" if i == 0 else ""}" type="button" data-lightbox="{e(src(name, 1600))}" aria-label="Open photograph {i + 1} of {e(v["name"])}">'
        f'{img(name, f"{v['name']} — photograph {i + 1}", sizes="(max-width: 760px) 100vw, 50vw", width=1600, height=1100)}</button>'
        for i, name in enumerate(v["gallery"])
    )
    amenities = "".join(
        f'<li><span>{e(a["label"])}</span><span>{e(a["value"])}</span></li>' for a in v["amenities"]
    )
    stay = "".join(f'<li><span>{e(s["label"])}</span><span>{e(s["value"])}</span></li>' for s in v["stay"])
    distances = "".join(
        f'<li><span>{e(d["label"])}</span><span>{e(d["value"])}</span></li>' for d in v["distances"]
    )
    desc = "".join(f"<p>{inline(p)}</p>" for p in v["description"])
    similar = "".join(
        villa_card(other, i)
        for i, other in enumerate([x for x in VILLAS if x["slug"] != v["slug"]][:3])
    )
    jsonld = {
        "@context": "https://schema.org",
        "@type": "VacationRental",
        "name": v["name"],
        "description": v["short"],
        "image": SITE_URL + src(v["image"], 1600),
        "address": {
            "@type": "PostalAddress",
            "addressLocality": v["location"],
            "addressCountry": {"ibiza": "ES", "formentera": "ES", "mykonos": "GR", "bali": "ID"}.get(v["destination"], "ES"),
        },
        "numberOfRooms": v["bedrooms"],
        "occupancy": {"@type": "QuantitativeValue", "maxValue": v["sleeps"]},
        "amenityFeature": [{"@type": "LocationFeatureSpecification", "name": a["label"], "value": a["value"]} for a in v["amenities"]],
        "priceRange": f"From {money(v['from'])} per week",
        "identifier": v["licence"],
    }
    body = f"""
<article class="villa-page">
  <section class="villa-hero">
    <div class="villa-hero-media" data-hero-media>
      {img(v['hero'], f"{v['name']}, {v['location']}", sizes="100vw", eager=True, width=1800, height=1200, extra="data-hero-img")}
      <span class="villa-hero-grade" aria-hidden="true"></span>
    </div>
    <div class="wrap villa-hero-copy">
      {breadcrumbs([("Home", "/"), ("The collection", "/villas/"), (v['name'], "")])}
      <p class="eyebrow eyebrow--light" data-reveal>{e(v['location'])} · Lic. {e(v['licence'])}</p>
      <h1 class="display display--hero" data-hero-title>{e(v['name'])}</h1>
      <p class="villa-hero-lede" data-reveal>{inline(v['short'])}</p>
    </div>
  </section>

  <div class="facts-bar">
    <div class="wrap facts-grid">
      <div class="fact"><span class="fact-num">{v['bedrooms']}</span><span class="fact-label">Bedrooms</span></div>
      <div class="fact"><span class="fact-num">{v['baths']}</span><span class="fact-label">Bathrooms</span></div>
      <div class="fact"><span class="fact-num">{v['sleeps']}</span><span class="fact-label">Sleeps</span></div>
      <div class="fact"><span class="fact-num">{money(v['from'])}</span><span class="fact-label">From / week</span></div>
      <div class="fact fact--cta"><a class="btn btn--ink btn--sm" href="#enquire">Enquire <span class="arw" aria-hidden="true">→</span></a></div>
    </div>
  </div>

  <section class="section section--tight">
    <div class="wrap gallery" data-gallery>{gallery}</div>
  </section>

  <section class="section">
    <div class="wrap villa-body-grid">
      <div class="villa-main">
        <p class="eyebrow" data-reveal>The house</p>
        <h2 class="display" data-split>{inline(v['short'])}</h2>
        <div class="prose" data-reveal>{desc}</div>
        <div class="villa-meta">
          <div>
            <h3>Amenities</h3>
            <ul class="spec-list">{amenities}</ul>
          </div>
          <div>
            <h3>The stay</h3>
            <ul class="spec-list">{stay}</ul>
          </div>
        </div>
        <div class="villa-location">
          <div>
            <p class="eyebrow">The setting</p>
            <h3>{e(v['location'])}</h3>
            <p class="loc-coords">{e(v['coordinates'])}</p>
          </div>
          <ul class="spec-list spec-list--dist">{distances}</ul>
        </div>
      </div>
      <aside class="enquiry-card" id="enquire" data-reveal>
        <p class="eyebrow">Enquire</p>
        <h2 class="display">{e(v['name'])}</h2>
        <p class="enquiry-price">{money(v['from'])} <small>/ week</small></p>
        <p class="enquiry-note">7 nights · sleeps {v['sleeps']} · taxes included</p>
        <form class="mini-form" data-enquiry-form data-email="{e(SITE['email'])}" data-subject="{e(v['name'])} enquiry">
          <label>Name<input type="text" name="name" autocomplete="name" required></label>
          <label>Email<input type="email" name="email" autocomplete="email" required></label>
          <label>Dates<input type="text" name="dates" placeholder="e.g. 12 – 19 July"></label>
          <label>Message<textarea name="message" rows="3" placeholder="Tell us who is travelling"></textarea></label>
          <button class="btn btn--ink" type="submit">Request availability <span class="arw" aria-hidden="true">→</span></button>
          <p class="form-note">A named account manager will reply within one working day.</p>
        </form>
        <a class="link-arrow enquiry-wa" href="https://wa.me/{e(SITE['whatsapp'])}?text={e('Hello Invenio, I would like to enquire about ' + v['name'])}" target="_blank" rel="noopener">WhatsApp <span class="arw" aria-hidden="true">→</span></a>
      </aside>
    </div>
  </section>

  <section class="section section--similar">
    <div class="wrap">
      <div class="sec-head sec-head--split">
        <div><p class="eyebrow" data-reveal>More houses</p><h2 class="display" data-split>You might also like.</h2></div>
        <div class="sec-side" data-reveal><a class="link-arrow" href="/villas/">The full collection <span class="arw" aria-hidden="true">→</span></a></div>
      </div>
      <div class="villa-grid">{similar}</div>
    </div>
  </section>
</article>
<div class="lightbox" data-lightbox-panel aria-hidden="true" role="dialog" aria-modal="true" aria-label="Photograph">
  <button class="lightbox-close" type="button" aria-label="Close photograph" data-lightbox-close>×</button>
  <img data-lightbox-img alt="">
</div>
<script type="application/ld+json">{json.dumps(jsonld, ensure_ascii=False)}</script>
"""
    return page(
        title=f"{v['name']}, {v['location']} — Invenio Homes",
        description=v["short"],
        body=body,
        active="/villas/",
        page_class="villa",
        canonical=f"/villas/{v['slug']}/",
        og_image=src(v["hero"], 1600),
        preload=v["hero"],
        over_header=True,
    )


# --------------------------------------------------------------------------- #
#  Destinations
# --------------------------------------------------------------------------- #


def build_destinations_index() -> str:
    p = PAGES["destinations"]
    cards = "".join(
        f"""
<article class="dest-editorial" data-reveal>
  <a class="dest-editorial-media" href="/destinations/{e(d['slug'])}/" data-cursor="Discover">
    {img(d['image'], f"{d['name']}, {d['country']}", sizes="(max-width: 900px) 100vw, 55vw", extra="data-parallax")}
    <span class="dest-editorial-num">{i + 1:02d}</span>
  </a>
  <div class="dest-editorial-copy">
    <p class="eyebrow">{e(d['country'])} · {e(d['coordinates'])}</p>
    <h2 class="display"><a href="/destinations/{e(d['slug'])}/">{e(d['name'])}</a></h2>
    <p class="dest-tag">{e(d['tagline'])}</p>
    <p>{inline(d['intro'])}</p>
    <a class="link-arrow" href="/destinations/{e(d['slug'])}/">Discover {e(d['name'])} <span class="arw" aria-hidden="true">→</span></a>
  </div>
</article>"""
        for i, d in enumerate(DESTINATIONS)
    )
    body = f"""
<section class="page-hero page-hero--big">
  <div class="wrap">
    {breadcrumbs([("Home", "/"), ("Destinations", "")])}
    <p class="eyebrow" data-reveal>{e(p['hero']['eyebrow'])}</p>
    <h1 class="display display--xl" data-split>{inline(p['hero']['title'])}</h1>
    <p class="lede lede--wide" data-reveal>{inline(p['hero']['lede'])}</p>
  </div>
  <div class="page-hero-band" data-img>{img(p['hero']['image'], p['hero']['imageAlt'], sizes="100vw", eager=True, width=1800, height=900)}</div>
</section>
<section class="section section--tight">
  <div class="wrap intro-pair">
    <p class="eyebrow" data-reveal>{e(p['intro']['eyebrow'])}</p>
    <div>
      <h2 class="statement" data-split>{inline(p['intro']['title'])}</h2>
      <p class="lede" data-reveal>{inline(p['intro']['body'])}</p>
    </div>
  </div>
</section>
<section class="section section--dest-editorial">
  <div class="wrap dest-editorial-list">{cards}</div>
</section>
{cta_band(HOME['cta'])}
"""
    return page(
        title=p["seo"]["title"],
        description=p["seo"]["description"],
        body=body,
        active="/destinations/",
        page_class="destinations",
        canonical="/destinations/",
        og_image=src(p["hero"]["image"], 1600),
        preload=p["hero"]["image"],
    )


def build_destination(d) -> str:
    villas = [v for v in VILLAS if v["destination"] == d["slug"]]
    cards = "".join(villa_card(v, i) for i, v in enumerate(villas))
    highlights = "".join(
        f'<li data-reveal><span class="hl-num">0{i + 1}</span><h3>{e(x["title"])}</h3><p>{e(x["text"])}</p></li>'
        for i, x in enumerate(d["highlights"])
    )
    gallery = "".join(
        f'<figure class="dest-gal dest-gal--{i + 1}" data-img>{img(name, f"{d['name']} — photograph {i + 1}", sizes="(max-width: 760px) 100vw, 50vw")}</figure>'
        for i, name in enumerate(d["gallery"])
    )
    villas_html = cards if villas else "<p class='fine-note'>The portfolio for this destination is expanding. Write to us for the current list.</p>"
    body = f"""
<article class="destination-page">
  <section class="villa-hero destination-hero">
    <div class="villa-hero-media" data-hero-media>
      {img(d['image'], f"{d['name']}, {d['country']}", sizes="100vw", eager=True, width=1800, height=1200, extra="data-hero-img")}
      <span class="villa-hero-grade" aria-hidden="true"></span>
    </div>
    <div class="wrap villa-hero-copy">
      {breadcrumbs([("Home", "/"), ("Destinations", "/destinations/"), (d['name'], "")])}
      <p class="eyebrow eyebrow--light" data-reveal>{e(d['country'])} · {e(d['coordinates'])}</p>
      <h1 class="display display--hero" data-hero-title>{e(d['name'])}</h1>
      <p class="villa-hero-lede" data-reveal>{e(d['tagline'])}</p>
    </div>
  </section>

  <section class="section">
    <div class="wrap dest-intro-grid">
      <div data-reveal><p class="eyebrow">The place</p><h2 class="statement" data-split>{inline(d['intro'])}</h2></div>
      <div class="prose" data-reveal>{''.join(f'<p>{inline(p)}</p>' for p in d['body'])}</div>
    </div>
  </section>

  <section class="section section--tight">
    <div class="wrap dest-highlights"><ul>{highlights}</ul></div>
  </section>

  <section class="section section--gallery">
    <div class="wrap dest-gal-grid">{gallery}</div>
  </section>

  <section class="section section--tight">
    <div class="wrap season-row" data-reveal>
      <div><p class="eyebrow">When to go</p><p class="season">{e(d['season'])}</p></div>
      <p>{inline(d['note'])}</p>
    </div>
  </section>

  <section class="section section--dest-villas">
    <div class="wrap">
      <div class="sec-head sec-head--split">
        <div><p class="eyebrow" data-reveal>The houses</p><h2 class="display" data-split>{e(d['name'])},<br>from the inside.</h2></div>
        <div class="sec-side" data-reveal><a class="link-arrow" href="/villas/">The full collection <span class="arw" aria-hidden="true">→</span></a></div>
      </div>
      <div class="villa-grid">{villas_html}</div>
    </div>
  </section>

  <section class="section section--quote">
    <div class="wrap">
      <figure class="big-quote" data-reveal>
        <blockquote>“{inline(d['quote']['text'])}”</blockquote>
        <figcaption>{e(d['quote']['author'])}</figcaption>
      </figure>
    </div>
  </section>
</article>
{cta_band(HOME['cta'])}
"""
    return page(
        title=f"{d['name']} — Invenio Homes",
        description=d["intro"],
        body=body,
        active="/destinations/",
        page_class="destination",
        canonical=f"/destinations/{d['slug']}/",
        og_image=src(d["image"], 1600),
        preload=d["image"],
        over_header=True,
    )


# --------------------------------------------------------------------------- #
#  Owners
# --------------------------------------------------------------------------- #


def build_owners() -> str:
    p = PAGES["owners"]
    values = "".join(
        f'<li class="value-card" data-reveal><span class="value-num">{e(v["num"])}</span><h3>{e(v["title"])}</h3><p>{e(v["body"])}</p></li>'
        for v in p["values"]["items"]
    )
    steps = "".join(
        f'<li class="step" data-reveal><span class="step-num">{e(s["num"])}</span><h3>{e(s["title"])}</h3><p>{e(s["text"])}</p></li>'
        for s in p["process"]["steps"]
    )
    service = "".join(f"<li>{e(i)}</li>" for i in p["service"]["list"])
    faqs = "".join(
        f'<details class="faq" data-reveal><summary>{e(f["q"])}<span aria-hidden="true">+</span></summary><div class="faq-body"><p>{e(f["a"])}</p></div></details>'
        for f in p["faq"]["items"]
    )
    body = f"""
<section class="page-hero page-hero--media">
  <div class="wrap page-hero-grid">
    <div>
      {breadcrumbs([("Home", "/"), ("For owners", "")])}
      <p class="eyebrow" data-reveal>{e(p['hero']['eyebrow'])}</p>
      <h1 class="display display--xl" data-split>{inline(p['hero']['title'])}</h1>
      <p class="lede" data-reveal>{inline(p['hero']['lede'])}</p>
      <div class="hero-actions" data-reveal>
        {link(p['hero']['primary']['href'], inline(p['hero']['primary']['label']) + ' <span class="arw" aria-hidden="true">→</span>', 'btn btn--ink')}
        {link(p['hero']['secondary']['href'], e(p['hero']['secondary']['label']), 'btn btn--ghost')}
      </div>
    </div>
    <div class="page-hero-media" data-img>{img(p['hero']['image'], p['hero']['imageAlt'], sizes="(max-width: 900px) 100vw, 36vw", extra="data-parallax")}</div>
  </div>
</section>

<section class="section section--intro">
  <div class="wrap intro-pair">
    <p class="eyebrow" data-reveal>{e(p['intro']['eyebrow'])}</p>
    <div>
      <h2 class="statement" data-split>{inline(p['intro']['title'])}</h2>
      <p class="lede" data-reveal>{inline(p['intro']['body'])}</p>
      <p class="signature">{e(p['intro']['signature'])}</p>
    </div>
  </div>
</section>

<section class="section section--values">
  <div class="wrap">
    {section_head(p['values']['eyebrow'], p['values']['title'])}
    <ul class="value-grid">{values}</ul>
  </div>
</section>

<section class="section section--service">
  <div class="wrap split">
    <div class="split-media" data-img>{img(p['service']['image'], p['service']['imageAlt'], sizes="(max-width: 900px) 100vw, 50vw", extra="data-parallax")}</div>
    <div class="split-copy">
      <p class="eyebrow" data-reveal>{e(p['service']['eyebrow'])}</p>
      <h2 class="display" data-split>{inline(p['service']['title'])}</h2>
      <p class="lede" data-reveal>{inline(p['service']['body'])}</p>
      <ul class="tick-list tick-list--two">{service}</ul>
      {link(p['service']['cta']['href'], inline(p['service']['cta']['label']) + ' <span class="arw" aria-hidden="true">→</span>', 'btn btn--line')}
    </div>
  </div>
</section>

<section class="section section--process">
  <div class="wrap">
    {section_head(p['process']['eyebrow'], p['process']['title'])}
    <ol class="step-grid">{steps}</ol>
  </div>
</section>

{stats_band(p['numbers'])}

<section class="section section--quote">
  <div class="wrap">
    <figure class="big-quote" data-reveal>
      <blockquote>“{inline(p['quote']['text'])}”</blockquote>
      <figcaption>{e(p['quote']['name'])} · {e(p['quote']['detail'])}</figcaption>
    </figure>
  </div>
</section>

<section class="section section--faq">
  <div class="wrap faq-grid">
    <div>
      <p class="eyebrow" data-reveal>{e(p['faq']['eyebrow'])}</p>
      <h2 class="display" data-split>{inline(p['faq']['title'])}</h2>
      <p class="lede" data-reveal>Not answered here? Write to <a href="mailto:{e(SITE['email'])}">{e(SITE['email'])}</a>.</p>
    </div>
    <div class="faq-list">{faqs}</div>
  </div>
</section>

{cta_band(p['cta'])}
"""
    return page(
        title=p["seo"]["title"],
        description=p["seo"]["description"],
        body=body,
        active="/owners/",
        page_class="owners",
        canonical="/owners/",
        og_image=src(p["hero"]["image"], 1600),
        preload=p["hero"]["image"],
    )


# --------------------------------------------------------------------------- #
#  Platform
# --------------------------------------------------------------------------- #


def build_platform() -> str:
    p = PAGES["platform"]
    features = "".join(
        f'<li data-reveal><span>{e(f["num"])}</span><h3>{e(f["title"])}</h3><p>{e(f["body"])}</p></li>'
        for f in p["features"]["items"]
    )
    steps = "".join(
        f'<li data-reveal><span class="step-num">{e(s["num"])}</span><h3>{e(s["title"])}</h3><p>{e(s["text"])}</p></li>'
        for s in p["agents"]["steps"]
    )
    owner_features = "".join(f"<li>{e(i)}</li>" for i in p["owners"]["features"])
    # Dashboard uses real portfolio entries so it stays true as content changes.
    demo = [v for v in VILLAS if v["destination"] == "ibiza"][:3]
    rows = "".join(
        f'<a class="dash-row" href="/villas/{e(v["slug"])}/">'
        f'<span class="dash-thumb">{img(v["image"], "", sizes="90px", width=90, height=64)}</span>'
        f'<span class="dash-info"><strong>{e(v["name"])}</strong><small>{e(v["location"])} · {v["bedrooms"]} bed · sleeps {v["sleeps"]}</small></span>'
        f'<span class="dash-price">{money(v["from"])}<small>/ wk</small></span></a>'
        for v in demo
    )
    body = f"""
<section class="platform-hero">
  <div class="wrap platform-hero-grid">
    <div class="platform-hero-copy">
      {breadcrumbs([("Home", "/"), ("The Platform", "")])}
      <p class="eyebrow eyebrow--light" data-reveal>{e(p['hero']['eyebrow'])}</p>
      <h1 class="display display--hero" data-split>{inline(p['hero']['title'])}</h1>
      <p class="lede" data-reveal>{inline(p['hero']['lede'])}</p>
      <div class="hero-actions" data-reveal>
        {link(p['hero']['primary']['href'], inline(p['hero']['primary']['label']) + ' <span class="arw" aria-hidden="true">→</span>', 'btn btn--paper')}
        {link(p['hero']['secondary']['href'], e(p['hero']['secondary']['label']), 'btn btn--ghost btn--light')}
      </div>
      <p class="platform-note" data-reveal>{e(p['hero']['note'])}</p>
    </div>
    <div class="dashboard" data-reveal aria-label="The Invenio Portal — example dashboard">
      <div class="dash-chrome"><span></span><span></span><span></span><em>Invenio Portal</em><small>Live</small></div>
      <div class="dash-body">
        <div class="dash-side">
          <span class="dash-logo">INVENIO</span>
          <span class="dash-nav is-on">Search</span>
          <span class="dash-nav">Holds</span>
          <span class="dash-nav">Offers</span>
          <span class="dash-nav">Clients</span>
          <span class="dash-nav">Reports</span>
        </div>
        <div class="dash-main">
          <div class="dash-filters">
            <span>Ibiza</span><span>10 — 17 Jul</span><span>10 guests</span><span>5+ bed</span><span class="dash-search">Search</span>
          </div>
          <p class="dash-count">297 properties <small>· price descending</small></p>
          <div class="dash-results">{rows}</div>
          <div class="dash-map" aria-hidden="true">
            <span class="dash-pin dash-pin--1"></span><span class="dash-pin dash-pin--2"></span><span class="dash-pin dash-pin--3"></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section section--dash-intro">
  <div class="wrap intro-pair">
    <p class="eyebrow" data-reveal>{e(p['dashboard']['eyebrow'])}</p>
    <div>
      <h2 class="statement" data-split>{inline(p['dashboard']['title'])}</h2>
      <p class="lede" data-reveal>{inline(p['dashboard']['body'])}</p>
      <p class="caption">{e(p['dashboard']['caption'])}</p>
    </div>
  </div>
</section>

<section class="section section--features">
  <div class="wrap">
    {section_head(p['features']['eyebrow'], p['features']['title'])}
    <ul class="feature-grid">{features}</ul>
  </div>
</section>

<section class="section section--agents">
  <div class="wrap">
    <div class="sec-head sec-head--split">
      <div><p class="eyebrow" data-reveal>{e(p['agents']['eyebrow'])}</p><h2 class="display" data-split>{inline(p['agents']['title'])}</h2></div>
      <div class="sec-side" data-reveal><p>{inline(p['agents']['body'])}</p><a class="link-arrow" href="{e(p['agents']['cta']['href'])}">{e(p['agents']['cta']['label'])} <span class="arw" aria-hidden="true">→</span></a></div>
    </div>
    <ol class="step-grid step-grid--four">{steps}</ol>
  </div>
</section>

<section class="section section--platform-owners">
  <div class="wrap split split--reverse">
    <div class="split-media" data-img>{img(p['owners']['image'], p['owners']['imageAlt'], sizes="(max-width: 900px) 100vw, 48vw", extra="data-parallax")}</div>
    <div class="split-copy">
      <p class="eyebrow" data-reveal>{e(p['owners']['eyebrow'])}</p>
      <h2 class="display" data-split>{inline(p['owners']['title'])}</h2>
      <p class="lede" data-reveal>{inline(p['owners']['body'])}</p>
      <ul class="tick-list">{owner_features}</ul>
      {link(p['owners']['cta']['href'], inline(p['owners']['cta']['label']) + ' <span class="arw" aria-hidden="true">→</span>', 'btn btn--line')}
    </div>
  </div>
</section>

<section class="section section--quote">
  <div class="wrap">
    <figure class="big-quote" data-reveal>
      <blockquote>“{inline(p['quote']['text'])}”</blockquote>
      <figcaption>{e(p['quote']['name'])} · {e(p['quote']['detail'])}</figcaption>
    </figure>
  </div>
</section>

<section class="access-band" id="access">
  <div class="wrap access-inner">
    <div data-reveal>
      <p class="eyebrow eyebrow--light">{e(p['access']['eyebrow'])}</p>
      <h2 class="display" data-split>{inline(p['access']['title'])}</h2>
      <p class="access-body">{inline(p['access']['body'])}</p>
      <p class="access-note">{e(p['access']['note'])}</p>
    </div>
    <div class="access-actions" data-reveal>
      {link(p['access']['primary']['href'], inline(p['access']['primary']['label']) + ' <span class="arw" aria-hidden="true">→</span>', 'btn btn--paper')}
      {link(p['access']['secondary']['href'], e(p['access']['secondary']['label']), 'btn btn--ghost btn--light')}
    </div>
  </div>
</section>
"""
    return page(
        title=p["seo"]["title"],
        description=p["seo"]["description"],
        body=body,
        active="/platform/",
        page_class="platform",
        canonical="/platform/",
        preload="",
        over_header=True,
    )


# --------------------------------------------------------------------------- #
#  About
# --------------------------------------------------------------------------- #


def build_about() -> str:
    p = PAGES["about"]
    badges = "".join(f"<li>{e(b)}</li>" for b in p["hero"]["badges"])
    story = "".join(f"<p>{inline(x)}</p>" for x in p["story"]["paragraphs"])
    values = "".join(
        f'<li class="value-card" data-reveal><span class="value-num">{e(v["num"])}</span><h3>{e(v["title"])}</h3><p>{e(v["body"])}</p></li>'
        for v in p["values"]["items"]
    )
    groups = "".join(
        f"""
<div class="team-group" data-reveal>
  <h3 class="team-group-title">{e(g['title'])}</h3>
  <ul class="team-list">
    {''.join(f'<li><span class="team-avatar">{e(pp["initials"])}</span><span class="team-name">{e(pp["name"])}</span><span class="team-role">{e(pp["role"])}</span><a href="mailto:{e(TEAM["email"])}?subject={e("Hello " + pp["name"])}" aria-label="Email {e(pp["name"])}">@</a></li>' for pp in g["people"])}
  </ul>
</div>"""
        for g in TEAM["groups"]
    )
    offices = "".join(
        f'<li data-reveal><span>{e(o["place"])}</span><strong>{e(o["role"])}</strong><small>{e(o["detail"])}</small></li>'
        for o in p["offices"]["items"]
    )
    body = f"""
<section class="page-hero page-hero--media page-hero--about">
  <div class="wrap page-hero-grid">
    <div>
      {breadcrumbs([("Home", "/"), ("About", "")])}
      <p class="eyebrow" data-reveal>{e(p['hero']['eyebrow'])}</p>
      <h1 class="display display--xl" data-split>{inline(p['hero']['title'])}</h1>
      <p class="lede" data-reveal>{inline(p['hero']['lede'])}</p>
      <ul class="hero-badges" data-reveal>{badges}</ul>
    </div>
    <div class="page-hero-media" data-img>{img(p['hero']['image'], p['hero']['imageAlt'], sizes="(max-width: 900px) 100vw, 36vw", extra="data-parallax")}</div>
  </div>
</section>

<section class="section">
  <div class="wrap split split--story">
    <div class="split-media" data-img>{img(p['story']['image'], p['story']['imageAlt'], sizes="(max-width: 900px) 100vw, 46vw", extra="data-parallax")}</div>
    <div class="split-copy">
      <p class="eyebrow" data-reveal>{e(p['story']['eyebrow'])}</p>
      <h2 class="display" data-split>{inline(p['story']['title'])}</h2>
      <div class="prose" data-reveal>{story}</div>
      <blockquote class="inline-quote" data-reveal>“{inline(p['story']['pullquote'])}”</blockquote>
    </div>
  </div>
</section>

<section class="section section--values">
  <div class="wrap">
    {section_head(p['values']['eyebrow'], p['values']['title'])}
    <ul class="value-grid">{values}</ul>
  </div>
</section>

{stats_band(p['numbers'])}

<section class="section section--team" id="team">
  <div class="wrap">
    {section_head(TEAM['eyebrow'], TEAM['title'], TEAM['body'])}
    <div class="team-groups">{groups}</div>
  </div>
</section>

<section class="section section--offices">
  <div class="wrap">
    {section_head(p['offices']['eyebrow'], p['offices']['title'])}
    <ul class="office-list">{offices}</ul>
  </div>
</section>

{cta_band(p['cta'])}
"""
    return page(
        title=p["seo"]["title"],
        description=p["seo"]["description"],
        body=body,
        active="/about/",
        page_class="about",
        canonical="/about/",
        og_image=src(p["hero"]["image"], 1600),
        preload=p["hero"]["image"],
    )


# --------------------------------------------------------------------------- #
#  Contact
# --------------------------------------------------------------------------- #


def build_contact() -> str:
    p = PAGES["contact"]
    subjects = "".join(f"<option>{e(s)}</option>" for s in p["form"]["subjects"])
    body = f"""
<section class="page-hero page-hero--contact">
  <div class="wrap contact-hero-grid">
    <div>
      {breadcrumbs([("Home", "/"), ("Contact", "")])}
      <p class="eyebrow" data-reveal>{e(p['hero']['eyebrow'])}</p>
      <h1 class="display display--xl" data-split>{inline(p['hero']['title'])}</h1>
      <p class="lede" data-reveal>{inline(p['hero']['lede'])}</p>
    </div>
    <div class="contact-direct" data-reveal>
      <a href="mailto:{e(SITE['email'])}" class="contact-big">{e(SITE['email'])}</a>
      <a href="tel:{e(SITE['phoneHref'])}" class="contact-big">{e(SITE['phone'])}</a>
      <a href="https://wa.me/{e(SITE['whatsapp'])}" target="_blank" rel="noopener" class="link-arrow">WhatsApp <span class="arw" aria-hidden="true">→</span></a>
    </div>
  </div>
</section>

<section class="section section--contact">
  <div class="wrap contact-grid">
    <div class="contact-form-wrap">
      <p class="eyebrow" data-reveal>Enquiries</p>
      <h2 class="display" data-split>{e(p['form']['title'])}</h2>
      <p class="lede" data-reveal>{e(p['form']['body'])}</p>
      <form class="contact-form" data-contact-form data-email="{e(SITE['email'])}" data-endpoint="{e(SITE['formEndpoint'])}" data-success="{e(p['form']['success'])}">
        <div class="field-row">
          <label>Name<input type="text" name="name" autocomplete="name" required></label>
          <label>Email<input type="email" name="email" autocomplete="email" required></label>
        </div>
        <div class="field-row">
          <label>Telephone<input type="tel" name="phone" autocomplete="tel"></label>
          <label>Subject<select name="subject">{subjects}</select></label>
        </div>
        <div class="field-row">
          <label>Destination<input type="text" name="destination" placeholder="Ibiza, Formentera, Mykonos, Bali"></label>
          <label>Dates<input type="text" name="dates" placeholder="Rough dates are fine"></label>
        </div>
        <label>Message<textarea name="message" rows="5" required placeholder="Tell us about the house, the guests, the season — anything useful."></textarea></label>
        <div class="form-foot">
          <button class="btn btn--ink" type="submit">{e(p['form']['submitLabel'])} <span class="arw" aria-hidden="true">→</span></button>
          <p class="form-note">{e(p['form']['note'])}</p>
        </div>
        <p class="form-status" data-form-status role="status"></p>
      </form>
    </div>
    <aside class="contact-aside">
      <figure class="contact-image" data-img>{img(p['image'], p['imageAlt'], sizes="(max-width: 900px) 100vw, 40vw")}</figure>
      <div class="contact-block" data-reveal>
        <h3>{e(p['details']['title'])}</h3>
        <dl>
          <dt>{e(p['details']['emailLabel'])}</dt><dd><a href="mailto:{e(SITE['email'])}">{e(SITE['email'])}</a></dd>
          <dt>{e(p['details']['phoneLabel'])}</dt><dd><a href="tel:{e(SITE['phoneHref'])}">{e(SITE['phone'])}</a></dd>
          <dt>{e(p['details']['whatsappLabel'])}</dt><dd><a href="https://wa.me/{e(SITE['whatsapp'])}" target="_blank" rel="noopener">Message us</a></dd>
          <dt>{e(p['details']['addressLabel'])}</dt><dd>{e(SITE['address'])}</dd>
          <dt>{e(p['details']['hoursLabel'])}</dt><dd>{e(p['details']['hours'])}</dd>
        </dl>
        <p class="form-note">{e(p['details']['note'])}</p>
      </div>
    </aside>
  </div>
</section>
"""
    return page(
        title=p["seo"]["title"],
        description=p["seo"]["description"],
        body=body,
        active="/contact/",
        page_class="contact",
        canonical="/contact/",
        og_image=src(p["image"], 1600),
    )


# --------------------------------------------------------------------------- #
#  Legal + 404
# --------------------------------------------------------------------------- #


def build_legal() -> list[tuple[str, str]]:
    out = []
    for doc in PAGES["legal"]["documents"]:
        sections = ""
        for s in doc["sections"]:
            paras = "".join(f"<p>{inline(p)}</p>" for p in s["paragraphs"])
            sections += f"<section><h2>{e(s['heading'])}</h2>{paras}</section>"
        body = f"""
<section class="page-hero page-hero--legal">
  <div class="wrap">
    {breadcrumbs([("Home", "/"), ("Legal", ""), (doc['title'], "")])}
    <p class="eyebrow" data-reveal>Legal · Updated {e(doc['updated'])}</p>
    <h1 class="display display--xl" data-split>{e(doc['title'])}</h1>
    <p class="lede" data-reveal>{inline(doc['intro'])}</p>
  </div>
</section>
<section class="section section--legal">
  <div class="wrap legal-grid">
    <nav class="legal-nav" aria-label="Legal pages">
      {''.join(f'<a href="/legal/{e(d["slug"])}/"{" aria-current=page" if d["slug"] == doc["slug"] else ""}>{e(d["title"])}</a>' for d in PAGES['legal']['documents'])}
    </nav>
    <div class="prose prose--legal">{sections}</div>
  </div>
</section>
"""
        html_out = page(
            title=f"{doc['title']} — Invenio Homes",
            description=doc["intro"],
            body=body,
            active="",
            page_class="legal",
            canonical=f"/legal/{doc['slug']}/",
        )
        out.append((f"legal/{doc['slug']}/index.html", html_out))
    return out



def build_credits() -> str:
    body = f"""
<section class="page-hero page-hero--legal">
  <div class="wrap">
    {breadcrumbs([("Home", "/"), ("Credits", "")])}
    <p class="eyebrow" data-reveal>Credits</p>
    <h1 class="display display--xl" data-split>Photography, type &amp; code.</h1>
    <p class="lede" data-reveal>Everything on this site that we did not make ourselves, and the people who made it.</p>
  </div>
</section>
<section class="section section--legal">
  <div class="wrap legal-grid">
    <nav class="legal-nav" aria-label="Credits">
      <a href="#photography">Photography</a>
      <a href="#type">Type</a>
      <a href="#code">Code</a>
    </nav>
    <div class="prose prose--legal">
      <section id="photography">
        <h2>Photography</h2>
        <p>Villa, interior and Es Vedrà photography: the Invenio Homes archive and handoff pack. Used with permission.</p>
        <p>Mykonos windmills: photograph by <a href="https://commons.wikimedia.org/wiki/File:Mykonos_20a.jpg" target="_blank" rel="noopener">René Hourdry</a>, licensed under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>. The image is cropped for layout; the licence applies to the photograph.</p>
        <p>Bali: <a href="https://unsplash.com/s/photos/bali" target="_blank" rel="noopener">Unsplash</a>, under the Unsplash License.</p>
        <p>Paper grain: generated for this site.</p>
      </section>
      <section id="type">
        <h2>Type</h2>
        <p><a href="https://fonts.google.com/specimen/Newsreader" target="_blank" rel="noopener">Newsreader</a> by Production Type, and <a href="https://fonts.google.com/specimen/Hanken+Grotesk" target="_blank" rel="noopener">Hanken Grotesk</a> by Alfredo Marco Pradil — both under the SIL Open Font License. Self-hosted here so the site does not call Google Fonts.</p>
      </section>
      <section id="code">
        <h2>Code</h2>
        <p>Motion by <a href="https://gsap.com/" target="_blank" rel="noopener">GSAP</a> (ScrollTrigger and SplitText) and <a href="https://github.com/darkroomengineering/lenis" target="_blank" rel="noopener">Lenis</a> (MIT). Build and Studio are original, dependency-free Python and Node.</p>
        <p>If you add a photograph or a typeface, add the credit here as well as in the content.</p>
      </section>
    </div>
  </div>
</section>
"""
    return page(
        title="Credits — Invenio Homes",
        description="Photography, type and code credits for the Invenio Homes website.",
        body=body,
        active="",
        page_class="legal",
        canonical="/credits/",
    )


def build_404() -> str:
    body = """
<section class="page-hero page-hero--404">
  <div class="wrap">
    <p class="eyebrow">404</p>
    <h1 class="display display--xl" data-split>This page has <em>checked out</em>.</h1>
    <p class="lede">The house may have moved, or the link is old. The collection is a good place to start.</p>
    <div class="hero-actions">
      <a class="btn btn--ink" href="/villas/">The collection <span class="arw" aria-hidden="true">→</span></a>
      <a class="btn btn--ghost" href="/">Home</a>
    </div>
  </div>
</section>
"""
    return page(
        title="Page not found — Invenio Homes",
        description="This page could not be found.",
        body=body,
        active="",
        page_class="404",
        canonical="/404.html",
        head_extra='<meta name="robots" content="noindex">',
    )


# --------------------------------------------------------------------------- #
#  Output
# --------------------------------------------------------------------------- #


def write(path: str, content: str):
    target = DIST / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def copy_assets():
    if (DIST / "assets").exists():
        shutil.rmtree(DIST / "assets")

    def ignore(directory, names):
        # Originals and Google Fonts' CSS are kept in the project but not deployed.
        return [n for n in names if n in {"source", ".DS_Store", "fonts.css"}]

    shutil.copytree(ASSETS, DIST / "assets", ignore=ignore)
    (DIST / "favicon.svg").write_text(FAVICON, encoding="utf-8")


def make_favicon_png():
    """A 180px touch icon, generated without external libraries."""
    svg = DIST / "favicon.svg"
    try:
        from PIL import Image, ImageDraw

        im = Image.new("RGB", (180, 180), "#244635")
        d = ImageDraw.Draw(im)
        d.rounded_rectangle((34, 34, 78, 146), radius=3, fill="#F2EDE3")
        d.rounded_rectangle((82, 34, 126, 146), radius=3, fill="#F2EDE3")
        d.polygon([(132, 34), (150, 34), (168, 146), (150, 146)], fill="#F2EDE3")
        (ASSETS / "img").mkdir(parents=True, exist_ok=True)
        im.save(ASSETS / "img/favicon-180.png", "PNG")
    except Exception:
        pass


def sitemap():
    pages = [
        ("/", "1.0"),
        ("/villas/", "0.9"),
        ("/destinations/", "0.9"),
        ("/owners/", "0.8"),
        ("/platform/", "0.8"),
        ("/about/", "0.7"),
        ("/contact/", "0.7"),
    ]
    pages += [(f"/villas/{v['slug']}/", "0.8") for v in VILLAS]
    pages += [(f"/destinations/{d['slug']}/", "0.8") for d in DESTINATIONS]
    pages += [(f"/legal/{d['slug']}/", "0.3") for d in PAGES["legal"]["documents"]]
    pages += [("/credits/", "0.2")]
    items = "".join(f"<url><loc>{SITE_URL}{p}</loc><priority>{pr}</priority></url>" for p, pr in pages)
    xml = f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{items}</urlset>'
    write("sitemap.xml", xml)
    write("robots.txt", f"User-agent: *\nAllow: /\nDisallow: /studio/\nSitemap: {SITE_URL}/sitemap.xml\n")


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    DIST.mkdir(parents=True, exist_ok=True)
    # Clean generated HTML, keep assets copy fresh.
    for item in DIST.iterdir():
        if item.name == "assets":
            continue
        if item.is_dir():
            shutil.rmtree(item)
        else:
            item.unlink()

    write("index.html", build_home())
    write("villas/index.html", build_villas_index())
    for villa in VILLAS:
        write(f"villas/{villa['slug']}/index.html", build_villa(villa))
    write("destinations/index.html", build_destinations_index())
    for d in DESTINATIONS:
        write(f"destinations/{d['slug']}/index.html", build_destination(d))
    write("owners/index.html", build_owners())
    write("platform/index.html", build_platform())
    write("about/index.html", build_about())
    write("contact/index.html", build_contact())
    for path, html_out in build_legal():
        write(path, html_out)
    write("credits/index.html", build_credits())
    write("404.html", build_404())

    make_favicon_png()
    copy_assets()
    sitemap()

    count = sum(1 for _ in DIST.rglob("*.html"))
    print(f"Built {count} pages into {DIST}")


if __name__ == "__main__":
    main()
