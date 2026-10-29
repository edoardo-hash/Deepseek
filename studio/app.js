/* Invenio Content Studio — application
   Vanilla JS. Reads/writes JSON through the local Studio API. */

import { SCHEMAS, NAV } from "./schema.js";

/* -------------------------------------------------------------------------- */
/* Utilities                                                                   */
/* -------------------------------------------------------------------------- */

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const slugify = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
const clone = (value) => JSON.parse(JSON.stringify(value ?? null));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function get(obj, path) {
  return String(path)
    .split(".")
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}
function set(obj, path, value) {
  const parts = String(path).split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (cur[key] == null || typeof cur[key] !== "object") cur[key] = {};
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
}
function imageUrl(name, width = 480) {
  const value = String(name || "").trim();
  if (!value) return "";
  if (value.startsWith("http") || value.startsWith("/")) return value;
  return `/assets/img/${value}-${width}.jpg`;
}
function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function formatMoney(value) {
  return "€" + Number(value || 0).toLocaleString("en-GB");
}
function countWords(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

const state = {
  docs: null,
  media: [],
  view: "home",
  item: null,
  dirty: false,
  saving: false,
  preview: false,
  lastSaved: null,
  lastError: null,
  session: null,
  picker: null,
};

/* -------------------------------------------------------------------------- */
/* API                                                                         */
/* -------------------------------------------------------------------------- */

async function api(path, options = {}) {
  const res = await fetch("/studio/api/" + path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  if (res.status === 401) {
    showLogin("Your session has expired. Sign in again.");
    throw new Error("unauthorised");
  }
  if (!res.ok) {
    throw new Error(data.error || "Something went wrong.");
  }
  return data;
}

/* -------------------------------------------------------------------------- */
/* Boot                                                                        */
/* -------------------------------------------------------------------------- */

async function init() {
  try {
    const session = await fetch("/studio/api/session").then((r) => r.json());
    state.session = session;
    if (!session.authenticated) {
      showLogin();
      return;
    }
    await loadContent();
    startApp();
  } catch (error) {
    showLogin("The Studio could not reach the server.");
  }
}

async function loadContent() {
  const data = await api("content");
  state.docs = data.docs;
  state.media = data.media || [];
}

function showLogin(message = "") {
  $("#app").hidden = true;
  $("#login").hidden = false;
  $("#boot").classList.add("is-done");
  if (message) {
    $("#login-error").textContent = message;
  }
  setTimeout(() => $("#password")?.focus(), 60);
}

function startApp() {
  $("#boot").classList.add("is-done");
  $("#login").hidden = true;
  $("#app").hidden = false;
  buildNav();
  go("home", { force: true });
  window.addEventListener("beforeunload", (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

/* -------------------------------------------------------------------------- */
/* Login / logout                                                              */
/* -------------------------------------------------------------------------- */

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.target.querySelector("button");
  const error = $("#login-error");
  error.textContent = "";
  button.disabled = true;
  button.textContent = "Signing in…";
  try {
    await fetch("/studio/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: $("#password").value }),
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not sign in.");
    });
    await loadContent();
    $("#password").value = "";
    startApp();
  } catch (err) {
    error.textContent = err.message;
  } finally {
    button.disabled = false;
    button.textContent = "Enter the Studio →";
  }
});

$("#logout").addEventListener("click", async () => {
  if (state.dirty && !confirm("You have unsaved changes. Sign out anyway?")) return;
  await fetch("/studio/api/logout", { method: "POST" }).catch(() => {});
  window.location.reload();
});

/* -------------------------------------------------------------------------- */
/* Navigation                                                                  */
/* -------------------------------------------------------------------------- */

function buildNav() {
  const nav = $("#nav");
  if (!nav) return;
  nav.innerHTML = "";
  let group = "";
  NAV.forEach((item) => {
    if (item.group !== group) {
      group = item.group;
      const label = document.createElement("div");
      label.className = "rail-label";
      label.textContent = group;
      nav.appendChild(label);
      const wrap = document.createElement("div");
      wrap.className = "rail-group";
      wrap.dataset.group = group;
      nav.appendChild(wrap);
    }
    const target = nav.querySelector(`[data-group="${group}"]`);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rail-item";
    button.dataset.key = item.key;
    button.innerHTML = `<span>${esc(item.label)}</span>`;
    if (item.badge?.startsWith("count:")) {
      const key = item.badge.split(":")[1];
      const count = Array.isArray(state.docs?.[key]) ? state.docs[key].length : 0;
      const badge = document.createElement("em");
      badge.textContent = String(count);
      button.appendChild(badge);
    }
    button.addEventListener("click", () => go(item.key));
    target.appendChild(button);
  });
  markNavActive();
}

function markNavActive() {
  $$(".rail-item").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.key === state.view);
  });
}

function closeRail() {
  $("#app").classList.remove("nav-open");
}

function go(key, { force = false } = {}) {
  if (!force && state.dirty && !confirm("Discard unsaved changes?")) return;
  state.view = key;
  state.item = null;
  state.dirty = false;
  state.lastError = null;
  closeRail();
  markNavActive();
  render();
}

/* -------------------------------------------------------------------------- */
/* Render router                                                               */
/* -------------------------------------------------------------------------- */

function render() {
  if (state.view === "media") {
    renderChrome({ label: "Media", kind: "object" });
    const mediaEditor = $("#editor");
    mediaEditor.innerHTML = "";
    window.scrollTo(0, 0);
    renderMediaView(mediaEditor);
    return;
  }
  const schema = SCHEMAS[state.view];
  if (!schema) return;
  renderChrome(schema);
  const editor = $("#editor");
  editor.innerHTML = "";
  window.scrollTo(0, 0);

  if (state.view === "legal") {
    if (state.item == null) renderList(editor, schema);
    else renderLegalEditor(editor);
    return;
  }

  if (schema.kind === "array") {
    if (state.item == null) renderList(editor, schema);
    else renderItemEditor(editor, schema);
    return;
  }

  renderObjectEditor(editor, schema);
}

function renderChrome(schema) {
  const crumb = $("#crumb");
  const title = $("#doc-title");
  const navItem = NAV.find((item) => item.key === state.view);
  const listLabel = navItem?.label || schema.label;
  const isItem = state.item != null && schema.kind === "array";
  const item =
    isItem && schema.kind === "array"
      ? state.docs[state.view][state.item]
      : state.view === "legal" && state.item != null
        ? state.docs.legal.documents[state.item]
        : null;
  crumb.textContent =
    state.view === "media"
      ? "System"
      : schema.kind === "array" || state.view === "legal"
        ? `${listLabel}${state.item != null ? " / " + (item?.[schema.itemLabel || "title"] || item?.title || "") : ""}`
        : "Content";
  title.textContent =
    state.view === "media"
      ? "Media library"
      : state.view === "settings"
        ? "Settings"
        : item
          ? item.name || item.title || listLabel
          : listLabel;
  updateStatus();
  const previewPath = previewPathFor();
  $("#preview-open").href = previewPath;
  if (state.preview) refreshPreview();
}

function updateStatus() {
  const status = $("#status");
  if (!status) return;
  status.className = "status";
  let text = "Published";
  if (state.saving) {
    status.classList.add("is-saving");
    text = "Saving";
  } else if (state.lastError) {
    status.classList.add("is-error");
    text = "Build error";
  } else if (state.dirty) {
    status.classList.add("is-dirty");
    text = "Unsaved changes";
  } else if (state.lastSaved) {
    text = "Published " + formatDate(state.lastSaved);
  }
  status.innerHTML = "<i></i><span></span>";
  status.querySelector("span").textContent = text;
  const save = $("#save");
  if (save) {
    save.classList.toggle("is-loading", state.saving);
    save.querySelector("span").textContent = state.saving ? "Publishing…" : "Save & publish";
  }
}

function markDirty() {
  state.dirty = true;
  updateStatus();
}

function rerender() {
  const y = window.scrollY;
  render();
  requestAnimationFrame(() => window.scrollTo(0, y));
}

/* -------------------------------------------------------------------------- */
/* List view                                                                   */
/* -------------------------------------------------------------------------- */

function renderList(editor, schema) {
  const isLegal = state.view === "legal";
  const items = isLegal ? state.docs.legal.documents : state.docs[state.view];
  const label = isLegal ? "Legal pages" : schema.label;
  const description = isLegal
    ? "Privacy, cookies and terms. These are linked from the footer."
    : state.view === "villas"
      ? "The houses in the public collection. Each one gets its own page."
      : "The islands, their stories and their houses.";

  const head = document.createElement("div");
  head.className = "list-head";
  head.innerHTML = `
    <div>
      <h2>${esc(label)}</h2>
      <p>${esc(description)}</p>
    </div>
    <button class="btn btn--green" type="button">Add ${isLegal ? "page" : state.view === "villas" ? "villa" : "destination"} <span aria-hidden="true">+</span></button>
  `;
  head.querySelector("button").addEventListener("click", addItem);
  editor.appendChild(head);

  const list = document.createElement("div");
  list.className = "list";
  items.forEach((item, index) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "list-row";
    if (isLegal) {
      row.innerHTML = `
        <span class="image-thumb" style="display:grid;place-items:center;font-family:var(--display);font-size:22px;color:var(--gold)">§</span>
        <span class="list-row-main"><strong>${esc(item.title || "Untitled")}</strong><span>/${esc(item.slug || "")}</span></span>
        <span class="list-row-meta"><b>${esc(item.updated || "")}</b>${(item.sections || []).length} sections</span>
        <span class="list-row-arrow">→</span>`;
    } else {
      const dest = state.docs.destinations?.find((d) => d.slug === item.destination);
      row.innerHTML = `
        <img src="${esc(imageUrl(item.image || item.hero, 480))}" alt="" loading="lazy">
        <span class="list-row-main">
          <strong>${esc(item.name || "Untitled")}</strong>
          <span>${esc(state.view === "villas" ? item.location || dest?.name || "" : item.country || "")}</span>
        </span>
        <span class="list-row-meta">
          <b>${state.view === "villas" ? formatMoney(item.from) : String((state.docs.villas || []).filter((v) => v.destination === item.slug).length) + " houses"}</b>
          ${state.view === "villas" ? `${esc(item.bedrooms || 0)} bed · ${esc(item.sleeps || 0)} guests` : esc(item.season || "")}
        </span>
        <span class="list-row-arrow">→</span>`;
    }
    row.addEventListener("click", () => {
      state.item = index;
      render();
    });
    list.appendChild(row);
  });
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = `<h3>Nothing here yet.</h3><p>Add the first ${isLegal ? "page" : state.view === "villas" ? "villa" : "destination"}.</p>`;
    list.appendChild(empty);
  }
  editor.appendChild(list);
}

function addItem() {
  if (state.view === "legal") {
    const docs = state.docs.legal.documents;
    let slug = "new-page";
    let n = 2;
    while (docs.some((d) => d.slug === slug)) slug = `new-page-${n++}`;
    docs.push({
      slug,
      title: "New page",
      updated: new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
      intro: "",
      sections: [{ heading: "", paragraphs: [""] }],
    });
    state.item = docs.length - 1;
  } else if (state.view === "villas") {
    const villas = state.docs.villas;
    let slug = "new-villa";
    let n = 2;
    while (villas.some((v) => v.slug === slug)) slug = `new-villa-${n++}`;
    villas.push({
      slug,
      name: "New villa",
      destination: state.docs.destinations?.[0]?.slug || "ibiza",
      location: "Ibiza",
      tag: "",
      bedrooms: 4,
      baths: 4,
      sleeps: 8,
      licence: "",
      from: 0,
      hero: "villa-can-nemo",
      image: "villa-can-nemo",
      gallery: [],
      short: "",
      description: [],
      amenities: [],
      stay: [],
      distances: [],
      coordinates: "",
      featured: false,
    });
    state.item = villas.length - 1;
  } else {
    const destinations = state.docs.destinations;
    let slug = "new-destination";
    let n = 2;
    while (destinations.some((d) => d.slug === slug)) slug = `new-destination-${n++}`;
    destinations.push({
      slug,
      name: "New destination",
      country: "",
      tagline: "",
      coordinates: "",
      image: "",
      intro: "",
      body: [],
      gallery: [],
      highlights: [],
      season: "",
      note: "",
      quote: { text: "", author: "" },
    });
    state.item = destinations.length - 1;
  }
  state.dirty = true;
  buildNav();
  render();
}

/* -------------------------------------------------------------------------- */
/* Item editor                                                                 */
/* -------------------------------------------------------------------------- */

function renderItemEditor(editor, schema) {
  const item = state.docs[state.view][state.item];
  const head = document.createElement("div");
  head.className = "page-head";
  head.innerHTML = `
    <div>
      <div class="breadcrumb"><button type="button" data-back>${esc(schema.label)}</button><i>/</i><span>${esc(item.name || item.title || "Untitled")}</span></div>
      <h2>${esc(item.name || item.title || "Untitled")}</h2>
      <p>${state.view === "villas" ? "Update the house, its story, photography and rates." : "Update the island, its story and photography."}</p>
    </div>
    <div class="page-head-actions">
      <button class="btn btn--ghost btn--sm" type="button" data-move="-1">↑ Move up</button>
      <button class="btn btn--ghost btn--sm" type="button" data-move="1">↓ Move down</button>
      <button class="btn btn--ghost btn--sm" type="button" data-delete>Delete</button>
    </div>
  `;
  head.querySelector("[data-back]").addEventListener("click", () => {
    if (state.dirty && !confirm("Discard unsaved changes?")) return;
    state.item = null;
    state.dirty = false;
    render();
  });
  const up = head.querySelector('[data-move="-1"]');
  const down = head.querySelector('[data-move="1"]');
  up.disabled = state.item === 0;
  down.disabled = state.item === state.docs[state.view].length - 1;
  up.addEventListener("click", () => moveItem(-1));
  down.addEventListener("click", () => moveItem(1));
  head.querySelector("[data-delete]").addEventListener("click", deleteItem);
  editor.appendChild(head);

  const form = document.createElement("div");
  form.className = "form";
  renderGroups(form, item, schema.groups, state.docs[state.view]);
  editor.appendChild(form);

  // Seed the slug from the name until it is edited by hand.
  const nameInput = form.querySelector('[data-field="name"]');
  const slugInput = form.querySelector('[data-field="slug"]');
  if (nameInput && slugInput) {
    let touched = Boolean(item.slug && !item.slug.startsWith("new-"));
    slugInput.addEventListener("input", () => {
      touched = true;
    });
    nameInput.addEventListener("input", () => {
      if (touched) return;
      item.slug = slugify(nameInput.value);
      slugInput.value = item.slug;
      markDirty();
    });
  }
}

function moveItem(delta) {
  const list = state.docs[state.view];
  const next = state.item + delta;
  if (next < 0 || next >= list.length) return;
  [list[state.item], list[next]] = [list[next], list[state.item]];
  state.item = next;
  state.dirty = true;
  render();
}

function deleteItem() {
  if (!confirm("Delete this item? This cannot be undone (a backup is kept on the server).")) return;
  state.docs[state.view].splice(state.item, 1);
  state.item = null;
  state.dirty = true;
  buildNav();
  render();
}

/* -------------------------------------------------------------------------- */
/* Legal editor                                                                */
/* -------------------------------------------------------------------------- */

const LEGAL_FIELDS = [
  {
    title: "Page",
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "slug", label: "URL slug", type: "text" },
      { key: "updated", label: "Last updated", type: "text" },
      { key: "intro", label: "Introduction", type: "textarea", rows: 3, wide: true },
    ],
  },
  {
    title: "Sections",
    fields: [
      {
        key: "sections",
        label: "Sections",
        type: "list",
        itemTitle: "heading",
        fields: [
          { key: "heading", label: "Heading", type: "text" },
          { key: "paragraphs", label: "Paragraphs", type: "strings", help: "One paragraph per line." },
        ],
      },
    ],
  },
];

function renderLegalEditor(editor) {
  const doc = state.docs.legal.documents[state.item];
  const head = document.createElement("div");
  head.className = "page-head";
  head.innerHTML = `
    <div>
      <div class="breadcrumb"><button type="button" data-back>Legal</button><i>/</i><span>${esc(doc.title || "")}</span></div>
      <h2>${esc(doc.title || "Legal page")}</h2>
      <p>Keep this copy reviewed by counsel. The date is shown on the page.</p>
    </div>
    <div class="page-head-actions">
      <button class="btn btn--ghost btn--sm" type="button" data-delete>Delete</button>
    </div>
  `;
  head.querySelector("[data-back]").addEventListener("click", () => {
    if (state.dirty && !confirm("Discard unsaved changes?")) return;
    state.item = null;
    state.dirty = false;
    render();
  });
  head.querySelector("[data-delete]").addEventListener("click", () => {
    if (!confirm("Delete this legal page?")) return;
    state.docs.legal.documents.splice(state.item, 1);
    state.item = null;
    state.dirty = true;
    render();
  });
  editor.appendChild(head);
  const form = document.createElement("div");
  renderGroups(form, doc, LEGAL_FIELDS, state.docs.legal.documents);
  editor.appendChild(form);
}

/* -------------------------------------------------------------------------- */
/* Object editor                                                               */
/* -------------------------------------------------------------------------- */

function renderObjectEditor(editor, schema) {
  const data = state.docs[state.view];
  const head = document.createElement("div");
  head.className = "page-head";
  head.innerHTML = `
    <div>
      <h2>${esc(schema.label)}</h2>
      <p>${pageDescription(state.view)}</p>
    </div>
    <div class="page-head-actions">
      <a class="btn btn--ghost btn--sm" href="${esc(previewPathFor())}" target="_blank" rel="noopener">Open page ↗</a>
    </div>
  `;
  editor.appendChild(head);
  const form = document.createElement("div");
  renderGroups(form, data, schema.groups, data);
  editor.appendChild(form);

  if (state.view === "settings") {
    const note = document.createElement("div");
    note.className = "notice";
    note.innerHTML =
      "<strong>A note on links.</strong> Internal links start with a slash, for example <code>/villas/</code>. Email links use <code>mailto:</code>, telephone links use <code>tel:</code>.";
    editor.appendChild(note);
  }
}

function pageDescription(view) {
  return {
    home: "The front page: hero, collection, platform, numbers, destinations, owners and testimonials.",
    settings: "Brand, navigation, contact details, footer, social links and SEO defaults.",
    testimonials: "The quotes that appear on the home page.",
    team: "The people listed on About. Initials are used instead of headshots.",
    owners: "The owner proposition, service, process and FAQ.",
    platform: "The agent and owner platform page.",
    about: "The story, values, numbers, team and offices.",
    contact: "Contact details and the enquiry form.",
    collection: "The hero and notes for the collection page.",
    destinationsPage: "The hero and introduction for the destinations index.",
    legal: "Privacy, cookies and terms.",
  }[view] || "";
}

/* -------------------------------------------------------------------------- */
/* Form rendering                                                              */
/* -------------------------------------------------------------------------- */

function renderGroups(container, obj, groups, root) {
  groups.forEach((group, index) => {
    const card = document.createElement("section");
    card.className = "card";
    const head = document.createElement("header");
    head.className = "card-head";
    head.innerHTML = `<span>${String(index + 1).padStart(2, "0")}</span><h3>${esc(group.title)}</h3>${group.description ? `<p>${esc(group.description)}</p>` : ""}`;
    const body = document.createElement("div");
    body.className = "card-body";
    const fields = document.createElement("div");
    fields.className = "fields";
    group.fields.forEach((field) => {
      fields.appendChild(renderField(field, obj, root));
    });
    body.appendChild(fields);
    card.append(head, body);
    container.appendChild(card);
  });
}

function fieldWrap(field) {
  const wrap = document.createElement("div");
  wrap.className = "field" + (field.wide || ["list", "images", "villas", "strings"].includes(field.type) ? " field--wide" : "");
  return wrap;
}

function addLabel(wrap, field, extra = "") {
  const label = document.createElement("div");
  label.className = "field-label";
  label.textContent = field.label;
  if (extra) {
    const extraEl = document.createElement("span");
    extraEl.className = "field-count";
    extraEl.textContent = extra;
    label.appendChild(extraEl);
  }
  wrap.appendChild(label);
}

function addHelp(wrap, field) {
  if (!field.help) return;
  const help = document.createElement("p");
  help.className = "field-help";
  help.textContent = field.help;
  wrap.appendChild(help);
}

function renderField(field, obj, root) {
  const wrap = fieldWrap(field);
  const value = get(obj, field.key);

  switch (field.type) {
    case "textarea": {
      const isSeoDescription = field.key.endsWith("seo.description");
      addLabel(wrap, field, typeof value === "string" ? (isSeoDescription ? value.length + " chars" : countWords(value) + " words") : "");
      const textarea = document.createElement("textarea");
      textarea.rows = field.rows || 4;
      textarea.value = value || "";
      textarea.dataset.field = field.key;
      textarea.addEventListener("input", () => {
        set(obj, field.key, textarea.value);
        const count = wrap.querySelector(".field-count");
        if (count) count.textContent = isSeoDescription ? textarea.value.length + " chars" : countWords(textarea.value) + " words";
        markDirty();
      });
      wrap.appendChild(textarea);
      addHelp(wrap, field);
      break;
    }
    case "strings": {
      const arr = Array.isArray(value) ? value : [];
      addLabel(wrap, field, arr.length + " lines");
      const textarea = document.createElement("textarea");
      textarea.rows = field.rows || Math.min(12, Math.max(4, arr.length + 2));
      textarea.value = arr.join("\n");
      textarea.dataset.field = field.key;
      textarea.addEventListener("input", () => {
        const next = textarea.value.split("\n").map((line) => line.trim()).filter(Boolean);
        set(obj, field.key, next);
        const count = wrap.querySelector(".field-count");
        if (count) count.textContent = next.length + " lines";
        markDirty();
      });
      wrap.appendChild(textarea);
      addHelp(wrap, field);
      break;
    }
    case "number": {
      addLabel(wrap, field);
      const input = document.createElement("input");
      input.type = "number";
      input.value = value ?? 0;
      if (field.min != null) input.min = field.min;
      if (field.max != null) input.max = field.max;
      if (field.step != null) input.step = field.step;
      input.dataset.field = field.key;
      input.addEventListener("input", () => {
        const num = input.value === "" ? 0 : Number(input.value);
        if (get(obj, field.key) !== num) {
          set(obj, field.key, num);
          markDirty();
        }
      });
      wrap.appendChild(input);
      addHelp(wrap, field);
      break;
    }
    case "checkbox": {
      const label = document.createElement("label");
      label.className = "check";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = Boolean(value);
      input.dataset.field = field.key;
      input.addEventListener("change", () => {
        set(obj, field.key, input.checked);
        markDirty();
      });
      const span = document.createElement("span");
      span.textContent = field.label;
      label.append(input, span);
      wrap.appendChild(label);
      addHelp(wrap, field);
      break;
    }
    case "select": {
      addLabel(wrap, field);
      const select = document.createElement("select");
      const options =
        field.source === "destinations"
          ? (state.docs.destinations || []).map((d) => ({ value: d.slug, label: d.name }))
          : field.options || [];
      options.forEach((option) => {
        const opt = document.createElement("option");
        opt.value = option.value ?? option;
        opt.textContent = option.label ?? option;
        if (String(opt.value) === String(value)) opt.selected = true;
        select.appendChild(opt);
      });
      select.dataset.field = field.key;
      select.addEventListener("change", () => {
        set(obj, field.key, select.value);
        markDirty();
      });
      wrap.appendChild(select);
      addHelp(wrap, field);
      break;
    }
    case "image": {
      addLabel(wrap, field);
      const current = String(value || "");
      const holder = document.createElement("div");
      holder.className = "image-field";
      const thumb = document.createElement("div");
      thumb.className = "image-thumb";
      if (current) {
        const img = document.createElement("img");
        img.src = imageUrl(current, 480);
        img.alt = "";
        img.addEventListener("error", () => {
          thumb.innerHTML = "";
        });
        thumb.appendChild(img);
      }
      const main = document.createElement("div");
      main.style.flex = "1";
      const path = document.createElement("input");
      path.type = "text";
      path.value = current;
      path.placeholder = "uploads/… or a path";
      path.dataset.field = field.key;
      path.addEventListener("input", () => {
        set(obj, field.key, path.value.trim());
        markDirty();
        const img = thumb.querySelector("img");
        if (path.value.trim()) {
          if (img) img.src = imageUrl(path.value.trim(), 480);
          else {
            const next = document.createElement("img");
            next.src = imageUrl(path.value.trim(), 480);
            thumb.appendChild(next);
          }
        } else {
          thumb.innerHTML = "";
        }
      });
      const actions = document.createElement("div");
      actions.className = "image-actions";
      const choose = document.createElement("button");
      choose.type = "button";
      choose.className = "mini-btn";
      choose.textContent = "Choose";
      choose.addEventListener("click", () =>
        openPicker((name) => {
          set(obj, field.key, name);
          markDirty();
          rerender();
        })
      );
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "mini-btn danger";
      clear.textContent = "Clear";
      clear.addEventListener("click", () => {
        set(obj, field.key, "");
        markDirty();
        rerender();
      });
      actions.append(choose, clear);
      main.append(path, actions);
      holder.append(thumb, main);
      wrap.appendChild(holder);
      addHelp(wrap, field);
      break;
    }
    case "images": {
      const arr = Array.isArray(value) ? value : [];
      addLabel(wrap, field, arr.length + " images");
      const grid = document.createElement("div");
      grid.className = "images-grid";
      arr.forEach((name, index) => {
        const tile = document.createElement("div");
        tile.className = "image-tile";
        tile.innerHTML = `<img src="${esc(imageUrl(name, 480))}" alt=""><div class="image-tile-bar"><span>${esc(name)}</span><span class="list-actions"><button type="button" class="mini-btn" data-left>←</button><button type="button" class="mini-btn" data-right>→</button><button type="button" class="mini-btn danger" data-remove>×</button></span></div>`;
        tile.querySelector("[data-left]").addEventListener("click", () => {
          if (index === 0) return;
          [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
          set(obj, field.key, arr);
          markDirty();
          rerender();
        });
        tile.querySelector("[data-right]").addEventListener("click", () => {
          if (index === arr.length - 1) return;
          [arr[index + 1], arr[index]] = [arr[index], arr[index + 1]];
          set(obj, field.key, arr);
          markDirty();
          rerender();
        });
        tile.querySelector("[data-remove]").addEventListener("click", () => {
          arr.splice(index, 1);
          set(obj, field.key, arr);
          markDirty();
          rerender();
        });
        grid.appendChild(tile);
      });
      wrap.appendChild(grid);
      const add = document.createElement("div");
      add.className = "images-add";
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn btn--ghost btn--sm";
      addBtn.textContent = "Add image +";
      addBtn.addEventListener("click", () =>
        openPicker((name) => {
          const next = Array.isArray(get(obj, field.key)) ? get(obj, field.key) : [];
          next.push(name);
          set(obj, field.key, next);
          markDirty();
          rerender();
        })
      );
      add.appendChild(addBtn);
      wrap.appendChild(add);
      addHelp(wrap, field);
      break;
    }
    case "villas": {
      const arr = Array.isArray(value) ? value : [];
      addLabel(wrap, field, arr.length + " selected");
      const picker = document.createElement("div");
      picker.className = "villa-picker";
      (state.docs.villas || []).forEach((villa) => {
        const label = document.createElement("label");
        label.className = "villa-pick";
        label.innerHTML = `<input type="checkbox" ${arr.includes(villa.slug) ? "checked" : ""}><img src="${esc(imageUrl(villa.image, 480))}" alt=""><span>${esc(villa.name)}</span>`;
        label.querySelector("input").addEventListener("change", (event) => {
          const current = Array.isArray(get(obj, field.key)) ? get(obj, field.key) : [];
          if (event.target.checked && !current.includes(villa.slug)) current.push(villa.slug);
          if (!event.target.checked) {
            const at = current.indexOf(villa.slug);
            if (at !== -1) current.splice(at, 1);
          }
          set(obj, field.key, current);
          markDirty();
          const count = wrap.querySelector(".field-count");
          if (count) count.textContent = current.length + " selected";
        });
        picker.appendChild(label);
      });
      wrap.appendChild(picker);
      addHelp(wrap, field);
      break;
    }
    case "list": {
      const arr = Array.isArray(value) ? value : [];
      addLabel(wrap, field, arr.length + (arr.length === 1 ? " item" : " items"));
      const repeater = document.createElement("div");
      repeater.className = "repeater";
      arr.forEach((item, index) => {
        const card = document.createElement("div");
        card.className = "rep-item";
        const head = document.createElement("div");
        head.className = "rep-head";
        const title =
          (field.itemTitle && (get(item, field.itemTitle) || item?.[field.itemTitle])) ||
          (typeof item === "string" ? item : "") ||
          `#${index + 1}`;
        head.innerHTML = `<span class="rep-num">${String(index + 1).padStart(2, "0")}</span><span class="rep-title">${esc(title)}</span>`;
        const tools = document.createElement("span");
        tools.className = "rep-tools";
        const up = document.createElement("button");
        up.type = "button";
        up.className = "mini-btn";
        up.textContent = "↑";
        up.disabled = index === 0;
        up.addEventListener("click", () => {
          if (index === 0) return;
          [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
          set(obj, field.key, arr);
          markDirty();
          rerender();
        });
        const down = document.createElement("button");
        down.type = "button";
        down.className = "mini-btn";
        down.textContent = "↓";
        down.disabled = index === arr.length - 1;
        down.addEventListener("click", () => {
          if (index === arr.length - 1) return;
          [arr[index + 1], arr[index]] = [arr[index], arr[index + 1]];
          set(obj, field.key, arr);
          markDirty();
          rerender();
        });
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "mini-btn danger";
        remove.textContent = "×";
        remove.addEventListener("click", () => {
          arr.splice(index, 1);
          set(obj, field.key, arr);
          markDirty();
          rerender();
        });
        tools.append(up, down, remove);
        head.appendChild(tools);
        const body = document.createElement("div");
        body.className = "rep-body";
        field.fields.forEach((sub) => body.appendChild(renderField(sub, item, root)));
        card.append(head, body);
        repeater.appendChild(card);
      });
      wrap.appendChild(repeater);
      const add = document.createElement("button");
      add.type = "button";
      add.className = "btn btn--ghost btn--sm rep-add";
      add.textContent = "Add " + (field.label || "item").toLowerCase().replace(/s$/, "") + " +";
      add.addEventListener("click", () => {
        const next = Array.isArray(get(obj, field.key)) ? get(obj, field.key) : [];
        next.push(defaultFromFields(field.fields));
        set(obj, field.key, next);
        markDirty();
        rerender();
      });
      wrap.appendChild(add);
      addHelp(wrap, field);
      break;
    }
    case "object": {
      if (!value || typeof value !== "object") {
        set(obj, field.key, {});
      }
      const target = get(obj, field.key);
      addLabel(wrap, field);
      const nested = document.createElement("div");
      nested.className = "object-fields";
      field.fields.forEach((sub) => {
        const el = renderField(sub, target, root);
        el.querySelectorAll("[data-field]").forEach((input) => {
          const key = input.dataset.field;
          input.dataset.field = `${field.key}.${key}`;
        });
        nested.appendChild(el);
      });
      wrap.appendChild(nested);
      addHelp(wrap, field);
      break;
    }
    default: {
      addLabel(wrap, field, field.key === "seo.description" && typeof value === "string" ? value.length + " chars" : "");
      const input = document.createElement("input");
      input.type = field.type === "email" ? "email" : field.type === "url" ? "url" : "text";
      input.value = value ?? "";
      input.placeholder = field.placeholder || "";
      input.dataset.field = field.key;
      input.autocomplete = "off";
      input.addEventListener("input", () => {
        set(obj, field.key, input.value);
        const count = wrap.querySelector(".field-count");
        if (count && field.key === "seo.description") count.textContent = input.value.length + " chars";
        markDirty();
      });
      wrap.appendChild(input);
      addHelp(wrap, field);
    }
  }
  return wrap;
}

function defaultFromFields(fields) {
  const out = {};
  fields.forEach((field) => {
    switch (field.type) {
      case "number":
        out[field.key] = 0;
        break;
      case "checkbox":
        out[field.key] = false;
        break;
      case "list":
      case "images":
      case "strings":
      case "villas":
        out[field.key] = [];
        break;
      case "object":
        out[field.key] = defaultFromFields(field.fields);
        break;
      default:
        out[field.key] = "";
    }
  });
  return out;
}

/* -------------------------------------------------------------------------- */
/* Media                                                                       */
/* -------------------------------------------------------------------------- */

function renderMediaView(editor) {
  const head = document.createElement("div");
  head.className = "list-head";
  head.innerHTML = `
    <div>
      <h2>Media library</h2>
      <p>${state.media.length} images. Uploads are resized automatically and stored in <code>assets/img/uploads</code>.</p>
    </div>
    <button class="btn btn--green" type="button" data-upload>Upload images +</button>
  `;
  head.querySelector("[data-upload]").addEventListener("click", () => $("#upload-input").click());
  editor.appendChild(head);

  const zone = document.createElement("div");
  zone.className = "upload-zone";
  zone.innerHTML = `<h3>Drop an image here.</h3><p>JPEG, PNG or WebP · up to 14 MB. It will be resized to 480, 960, 1600 and 2400 px.</p><button class="btn btn--ghost btn--sm" type="button">Choose a file</button>`;
  const button = zone.querySelector("button");
  button.addEventListener("click", () => $("#upload-input").click());
  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.style.borderColor = "var(--green)";
  });
  zone.addEventListener("dragleave", () => {
    zone.style.borderColor = "";
  });
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.style.borderColor = "";
    if (event.dataTransfer?.files?.length) uploadFiles(event.dataTransfer.files);
  });
  editor.appendChild(zone);

  const grid = document.createElement("div");
  grid.className = "media-grid";
  state.media.forEach((item) => {
    const card = document.createElement("div");
    card.className = "media-item";
    card.innerHTML = `<img src="${esc(item.url)}" alt="" loading="lazy"><div class="media-item-bar"><span>${esc(item.name)}</span><button type="button" class="mini-btn" data-copy>Copy</button>${item.uploaded ? '<button type="button" class="mini-btn danger" data-del>×</button>' : ""}</div>`;
    card.querySelector("[data-copy]").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(item.name);
        toast("Path copied: " + item.name);
      } catch {
        toast("Copy failed — select the path manually.", "error");
      }
    });
    const del = card.querySelector("[data-del]");
    if (del) {
      del.addEventListener("click", async () => {
        if (!confirm("Remove this uploaded image? Content using it will show a missing image.")) return;
        try {
          const result = await api("media", { method: "DELETE", body: JSON.stringify({ name: item.name }) });
          state.media = result.media;
          toast("Image removed.");
          render();
        } catch (error) {
          toast(error.message, "error");
        }
      });
    }
    grid.appendChild(card);
  });
  editor.appendChild(grid);
}

function openPicker(onPick) {
  const modal = $("#media-modal");
  state.picker = onPick;
  renderPickerGrid();
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closePicker() {
  const modal = $("#media-modal");
  state.picker = null;
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function renderPickerGrid() {
  const grid = $("#modal-media");
  grid.innerHTML = "";
  state.media.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "media-item";
    button.innerHTML = `<img src="${esc(item.url)}" alt="" loading="lazy"><div class="media-item-bar"><span>${esc(item.name)}</span></div>`;
    button.addEventListener("click", () => {
      const pick = state.picker;
      closePicker();
      if (pick) pick(item.name);
    });
    grid.appendChild(button);
  });
  if (!state.media.length) {
    grid.innerHTML = '<p class="modal-hint">No images yet. Upload one above.</p>';
  }
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

async function uploadFiles(files) {
  const list = Array.from(files).filter((file) => file.type.startsWith("image/"));
  if (!list.length) return;
  toast("Uploading " + list.length + (list.length === 1 ? " image…" : " images…"));
  for (const file of list) {
    try {
      const data = await fileToDataUrl(file);
      const result = await api("upload", {
        method: "POST",
        body: JSON.stringify({ name: file.name, data }),
      });
      state.media = result.media;
    } catch (error) {
      toast(error.message, "error");
    }
  }
  toast(list.length + (list.length === 1 ? " image uploaded." : " images uploaded."));
  if (state.view === "media") render();
  if (!$("#media-modal").hidden) renderPickerGrid();
}

$("#upload-input").addEventListener("change", (event) => {
  if (event.target.files?.length) uploadFiles(event.target.files);
  event.target.value = "";
});
$("#modal-upload").addEventListener("change", (event) => {
  if (event.target.files?.length) uploadFiles(event.target.files);
  event.target.value = "";
});
$("#media-close").addEventListener("click", closePicker);
$("#media-modal").addEventListener("click", (event) => {
  if (event.target === $("#media-modal")) closePicker();
});

/* -------------------------------------------------------------------------- */
/* Save                                                                        */
/* -------------------------------------------------------------------------- */

function currentTarget() {
  const schema = SCHEMAS[state.view];
  if (!schema || state.view === "media") return null;
  return { file: schema.file, data: state.docs[state.view] };
}

function validate(target) {
  let items = null;
  if (state.view === "villas" || state.view === "destinations") items = target.data;
  if (state.view === "legal") items = target.data.documents;
  if (!items) return null;
  const seen = new Map();
  for (const item of items) {
    const slug = slugify(item.slug || "");
    if (!slug) return "Every page needs a URL slug.";
    if (seen.has(slug)) return `Two pages share the slug “${slug}”. Make them unique.`;
    seen.set(slug, true);
  }
  return null;
}

async function save() {
  if (state.saving) return;
  const target = currentTarget();
  if (!target) return;
  const problem = validate(target);
  if (problem) {
    toast(problem, "error");
    return;
  }
  state.saving = true;
  state.lastError = null;
  updateStatus();
  try {
    const result = await api("save", {
      method: "POST",
      body: JSON.stringify({ file: target.file, data: target.data }),
    });
    state.dirty = false;
    state.lastSaved = result.savedAt;
    updateStatus();
    toast("Published. The site has been rebuilt.");
    refreshPreview(true);
  } catch (error) {
    state.lastError = error.message;
    updateStatus();
    toast(error.message, "error");
  } finally {
    state.saving = false;
    updateStatus();
  }
}

/* -------------------------------------------------------------------------- */
/* Preview                                                                     */
/* -------------------------------------------------------------------------- */

function previewPathFor() {
  switch (state.view) {
    case "villas":
      return state.item != null ? `/villas/${state.docs.villas[state.item]?.slug || ""}/` : "/villas/";
    case "destinations":
      return state.item != null ? `/destinations/${state.docs.destinations[state.item]?.slug || ""}/` : "/destinations/";
    case "owners":
      return "/owners/";
    case "platform":
      return "/platform/";
    case "about":
      return "/about/";
    case "contact":
      return "/contact/";
    case "collection":
      return "/villas/";
    case "destinationsPage":
      return "/destinations/";
    case "legal":
      return state.item != null ? `/legal/${state.docs.legal.documents[state.item]?.slug || ""}/` : "/legal/privacy/";
    case "testimonials":
    case "home":
    case "settings":
    case "media":
      return "/";
    case "team":
      return "/about/#team";
    default:
      return "/";
  }
}

function refreshPreview(force = false) {
  const iframe = $("#preview-frame");
  if (!iframe) return;
  const path = previewPathFor();
  $("#preview-open").href = path;
  if (!state.preview && !force) return;
  const url = path + (path.includes("?") ? "&" : "?") + "preview=" + Date.now();
  iframe.src = url;
}

$("#preview-toggle").addEventListener("click", () => {
  state.preview = !state.preview;
  $("#app").classList.toggle("preview-open", state.preview);
  $("#preview-toggle").textContent = state.preview ? "Hide preview" : "Preview";
  if (state.preview) refreshPreview(true);
});
$("#preview-refresh").addEventListener("click", () => refreshPreview(true));

/* -------------------------------------------------------------------------- */
/* Toast                                                                       */
/* -------------------------------------------------------------------------- */

let toastTimer = null;
function toast(message, type = "ok") {
  const el = $("#toast");
  el.textContent = message;
  el.classList.toggle("is-error", type === "error");
  el.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-on"), 4200);
}

/* -------------------------------------------------------------------------- */
/* Global controls                                                             */
/* -------------------------------------------------------------------------- */

$("#save").addEventListener("click", save);
$("#drawer").addEventListener("click", () => $("#app").classList.toggle("nav-open"));
$("#scrim").addEventListener("click", closeRail);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!$("#media-modal").hidden) closePicker();
    else closeRail();
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    save();
  }
});

// Start
init();
