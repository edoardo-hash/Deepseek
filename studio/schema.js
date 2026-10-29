/* Studio schema — the map of every editable field.
   Field types: text, textarea, number, image, images, select, checkbox,
   list, object, strings, villas, color.
   This is what makes the Studio feel like a CMS rather than a JSON editor. */

const t = (key, label, opts = {}) => ({ key, label, type: "text", ...opts });
const ta = (key, label, opts = {}) => ({ key, label, type: "textarea", ...opts });
const n = (key, label, opts = {}) => ({ key, label, type: "number", ...opts });
const ck = (key, label, opts = {}) => ({ key, label, type: "checkbox", ...opts });
const img = (key, label, opts = {}) => ({ key, label, type: "image", ...opts });
const imgs = (key, label, opts = {}) => ({ key, label, type: "images", ...opts });
const sel = (key, label, opts = {}) => ({ key, label, type: "select", ...opts });
const obj = (key, label, fields, opts = {}) => ({ key, label, type: "object", fields, ...opts });
const list = (key, label, fields, opts = {}) => ({ key, label, type: "list", fields, ...opts });
const strings = (key, label, opts = {}) => ({ key, label, type: "strings", ...opts });

const link = (key, label) => obj(key, label, [t("label", "Label"), t("href", "Link / email")]);
const seo = [
  {
    title: "SEO",
    fields: [
      t("seo.title", "Page title", { help: "The browser tab and search result title." }),
      ta("seo.description", "Meta description", { rows: 3, help: "One or two sentences, around 155 characters." }),
    ],
  },
];

const statFields = [n("number", "Number"), t("suffix", "Suffix", { placeholder: "+" }), t("label", "Label")];

const numberBlock = {
  title: "Numbers",
  fields: [
    t("numbers.eyebrow", "Eyebrow"),
    t("numbers.title", "Title", { help: "Leave empty to show only the numbers." }),
    list("numbers.stats", "Statistics", statFields, { itemTitle: "label", max: 4 }),
    t("numbers.note", "Footnote"),
  ],
};

const ctaBlock = {
  title: "Closing call to action",
  fields: [
    t("cta.eyebrow", "Eyebrow"),
    t("cta.title", "Title"),
    ta("cta.body", "Body", { rows: 3 }),
    link("cta.primary", "Primary button"),
    link("cta.secondary", "Secondary button"),
  ],
};

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

export const settings = {
  label: "Settings",
  file: "settings.json",
  kind: "object",
  groups: [
    {
      title: "Brand",
      fields: [
        t("site.name", "Name"),
        t("site.url", "Site URL", { help: "Canonical origin used in SEO tags, social images and sitemap.xml." }),
        t("site.shortName", "Short name"),
        ta("site.tagline", "Tagline", { rows: 2 }),
        t("site.email", "Email", { type: "email" }),
        t("site.phone", "Phone (display)"),
        t("site.phoneHref", "Phone (dial)"),
        t("site.whatsapp", "WhatsApp number", { help: "Digits only, with country code." }),
        t("site.address", "Address"),
        t("site.legalName", "Legal name"),
        t("site.taxId", "Tax ID"),
        t("site.coordinates", "Coordinates"),
        t("site.copyright", "Copyright line"),
        t("site.logo", "Dark logo path"),
        t("site.logoLight", "Light logo path"),
      ],
    },
    {
      title: "Portal & forms",
      fields: [
        t("site.portalUrl", "Portal URL", { help: "Where 'Sign in' should go." }),
        t("site.signinUrl", "Sign-in URL"),
        t("site.formEndpoint", "Form endpoint", {
          help: "Optional. Leave empty to open the visitor's email app. Paste a Formspree / Basin endpoint to post instead.",
        }),
      ],
    },
    {
      title: "Navigation",
      fields: [list("nav", "Menu links", [t("label", "Label"), t("href", "Link")], { itemTitle: "label" })],
    },
    {
      title: "Footer",
      fields: [
        ta("footer.statement", "Statement", { rows: 3 }),
        t("footer.photoCredit", "Photo credit"),
        list("footer.columns", "Columns", [t("title", "Title"), list("links", "Links", [t("label", "Label"), t("href", "Link")], { itemTitle: "label" })], {
          itemTitle: "title",
        }),
        list("footer.legalLinks", "Legal links", [t("label", "Label"), t("href", "Link")], { itemTitle: "label" }),
      ],
    },
    {
      title: "SEO & social",
      fields: [
        t("seo.title", "Default title"),
        ta("seo.description", "Default description", { rows: 3 }),
        img("seo.ogImage", "Social share image", { help: "Stored path, or choose an image below." }),
        t("seo.themeColor", "Theme colour"),
        t("site.instagram", "Instagram URL"),
        t("site.linkedin", "LinkedIn URL"),
        t("site.facebook", "Facebook URL"),
      ],
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Home                                                                        */
/* -------------------------------------------------------------------------- */

export const home = {
  label: "Home",
  file: "home.json",
  kind: "object",
  groups: [
    ...seo,
    {
      title: "Hero",
      fields: [
        t("hero.eyebrow", "Eyebrow"),
        t("hero.title", "Headline", { help: "Wrap words in *asterisks* for the italic accent." }),
        ta("hero.lede", "Intro", { rows: 3 }),
        img("hero.image", "Image"),
        t("hero.imageAlt", "Image alt text"),
        t("hero.caption", "Image caption"),
        link("hero.primary", "Primary button"),
        link("hero.secondary", "Secondary button"),
        list("hero.facts", "Facts strip", [t("value", "Value"), t("label", "Label")], { itemTitle: "label", max: 4 }),
      ],
    },
    {
      title: "Introduction",
      fields: [
        t("intro.eyebrow", "Eyebrow"),
        ta("intro.title", "Statement", { rows: 3 }),
        ta("intro.body", "Body", { rows: 4 }),
        t("intro.signature", "Signature"),
        list("intro.images", "Accompanying images", [img("image", "Image"), t("alt", "Alt text")], { itemTitle: "image", max: 2 }),
      ],
    },
    {
      title: "Marquee",
      fields: [t("marquee.lineOne", "First line"), t("marquee.lineTwo", "Second line")],
    },
    {
      title: "Featured collection",
      fields: [
        t("collection.eyebrow", "Eyebrow"),
        ta("collection.title", "Title", { rows: 2 }),
        ta("collection.body", "Body", { rows: 3 }),
        t("collection.linkLabel", "Link label"),
        t("collection.linkHref", "Link"),
        { key: "collection.villas", label: "Houses to feature", type: "villas", help: "Choose from the collection." },
      ],
    },
    {
      title: "Platform",
      fields: [
        t("platform.eyebrow", "Eyebrow"),
        ta("platform.title", "Title", { rows: 2 }),
        ta("platform.body", "Body", { rows: 3 }),
        img("platform.image", "Image"),
        t("platform.imageAlt", "Image alt text"),
        list("platform.features", "Features", [t("title", "Title"), t("text", "Text")], { itemTitle: "title", max: 4 }),
        link("platform.cta", "Button"),
      ],
    },
    numberBlock,
    {
      title: "Destinations",
      fields: [
        t("destinations.eyebrow", "Eyebrow"),
        t("destinations.title", "Title"),
        ta("destinations.body", "Body", { rows: 3 }),
        t("destinations.linkLabel", "Link label"),
        t("destinations.linkHref", "Link"),
      ],
    },
    {
      title: "For owners",
      fields: [
        t("owners.eyebrow", "Eyebrow"),
        ta("owners.title", "Title", { rows: 2 }),
        ta("owners.body", "Body", { rows: 4 }),
        strings("owners.bullets", "Bullets"),
        img("owners.image", "Image"),
        t("owners.imageAlt", "Image alt text"),
        link("owners.cta", "Button"),
      ],
    },
    {
      title: "Testimonials",
      fields: [
        t("testimonials.eyebrow", "Eyebrow"),
        ta("testimonials.title", "Title", { rows: 2 }),
        n("testimonials.limit", "How many to show", { min: 1, max: 8 }),
      ],
    },
    ctaBlock,
  ],
};

/* -------------------------------------------------------------------------- */
/* Villas                                                                      */
/* -------------------------------------------------------------------------- */

export const villa = {
  label: "Villa",
  kind: "item",
  groups: [
    {
      title: "Identity",
      fields: [
        t("name", "Name"),
        t("slug", "URL slug", { help: "Lowercase, hyphenated. Changing it changes the page address." }),
        sel("destination", "Island", { source: "destinations" }),
        t("location", "Location"),
        t("tag", "Badge", { placeholder: "Invenio Exclusive" }),
        t("coordinates", "Coordinates"),
      ],
    },
    {
      title: "The facts",
      fields: [
        n("bedrooms", "Bedrooms", { min: 1, max: 30 }),
        n("baths", "Bathrooms", { min: 1, max: 30 }),
        n("sleeps", "Sleeps", { min: 1, max: 40 }),
        t("licence", "Licence"),
        n("from", "From / week (€)", { min: 0, step: 100 }),
        ck("featured", "Featured"),
      ],
    },
    {
      title: "Story",
      fields: [
        ta("short", "Short description", { rows: 3, help: "Used on cards and at the top of the page." }),
        strings("description", "Full description", { help: "One paragraph per line." }),
      ],
    },
    {
      title: "Photography",
      fields: [
        img("hero", "Hero image"),
        img("image", "Card image"),
        imgs("gallery", "Gallery", { help: "The first image is shown wide." }),
      ],
    },
    {
      title: "Amenities",
      fields: [list("amenities", "Amenities", [t("label", "Label"), t("value", "Value")], { itemTitle: "label" })],
    },
    {
      title: "The stay",
      fields: [list("stay", "Details", [t("label", "Label"), t("value", "Value")], { itemTitle: "label" })],
    },
    {
      title: "Distances",
      fields: [list("distances", "Distances", [t("label", "Label"), t("value", "Value")], { itemTitle: "label" })],
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Destinations                                                                */
/* -------------------------------------------------------------------------- */

export const destination = {
  label: "Destination",
  kind: "item",
  groups: [
    {
      title: "Identity",
      fields: [
        t("name", "Name"),
        t("slug", "URL slug"),
        t("country", "Country"),
        t("tagline", "Tagline"),
        t("coordinates", "Coordinates"),
      ],
    },
    {
      title: "Story",
      fields: [
        ta("intro", "Introduction", { rows: 3 }),
        strings("body", "Full text", { help: "One paragraph per line." }),
      ],
    },
    {
      title: "Photography",
      fields: [img("image", "Hero image"), imgs("gallery", "Gallery", { help: "Three images works best." })],
    },
    {
      title: "Highlights",
      fields: [list("highlights", "Highlights", [t("title", "Title"), ta("text", "Text", { rows: 3 })], { itemTitle: "title", max: 4 })],
    },
    {
      title: "Season",
      fields: [t("season", "Season"), ta("note", "Note", { rows: 3 })],
    },
    {
      title: "Quote",
      fields: [ta("quote.text", "Quote", { rows: 3 }), t("quote.author", "Attribution")],
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Shared content                                                              */
/* -------------------------------------------------------------------------- */

export const testimonials = {
  label: "Testimonials",
  file: "testimonials.json",
  kind: "object",
  groups: [
    {
      title: "Heading",
      fields: [t("eyebrow", "Eyebrow")],
    },
    {
      title: "Quotes",
      fields: [
        list(
          "items",
          "Testimonials",
          [ta("quote", "Quote", { rows: 4 }), t("name", "Name"), t("detail", "Detail"), ck("featured", "Featured on the home page")],
          { itemTitle: "name" }
        ),
      ],
    },
  ],
};

export const team = {
  label: "Team",
  file: "team.json",
  kind: "object",
  groups: [
    {
      title: "Heading",
      fields: [t("eyebrow", "Eyebrow"), t("title", "Title"), ta("body", "Body", { rows: 3 }), t("email", "Email")],
    },
    {
      title: "People",
      fields: [
        list(
          "groups",
          "Teams",
          [
            t("title", "Group title"),
            list("people", "People", [t("name", "Name"), t("role", "Role"), t("initials", "Initials")], { itemTitle: "name" }),
          ],
          { itemTitle: "title" }
        ),
      ],
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Pages                                                                       */
/* -------------------------------------------------------------------------- */

export const owners = {
  label: "Owners",
  file: "pages/owners.json",
  kind: "object",
  groups: [
    ...seo,
    {
      title: "Hero",
      fields: [
        t("hero.eyebrow", "Eyebrow"),
        ta("hero.title", "Headline", { rows: 2 }),
        ta("hero.lede", "Intro", { rows: 3 }),
        img("hero.image", "Image"),
        t("hero.imageAlt", "Image alt text"),
        link("hero.primary", "Primary button"),
        link("hero.secondary", "Secondary button"),
      ],
    },
    {
      title: "Introduction",
      fields: [
        t("intro.eyebrow", "Eyebrow"),
        ta("intro.title", "Statement", { rows: 2 }),
        ta("intro.body", "Body", { rows: 4 }),
        t("intro.signature", "Signature"),
      ],
    },
    {
      title: "Why owners choose us",
      fields: [
        t("values.eyebrow", "Eyebrow"),
        t("values.title", "Title"),
        list("values.items", "Reasons", [t("num", "Number"), t("title", "Title"), ta("body", "Text", { rows: 3 })], { itemTitle: "title", max: 4 }),
      ],
    },
    {
      title: "Service",
      fields: [
        t("service.eyebrow", "Eyebrow"),
        ta("service.title", "Title", { rows: 2 }),
        ta("service.body", "Body", { rows: 3 }),
        img("service.image", "Image"),
        t("service.imageAlt", "Image alt text"),
        strings("service.list", "What we handle"),
        link("service.cta", "Button"),
      ],
    },
    {
      title: "Process",
      fields: [
        t("process.eyebrow", "Eyebrow"),
        t("process.title", "Title"),
        list("process.steps", "Steps", [t("num", "Number"), t("title", "Title"), ta("text", "Text", { rows: 3 })], { itemTitle: "title" }),
      ],
    },
    numberBlock,
    {
      title: "Quote",
      fields: [ta("quote.text", "Quote", { rows: 3 }), t("quote.name", "Name"), t("quote.detail", "Detail")],
    },
    {
      title: "FAQ",
      fields: [
        t("faq.eyebrow", "Eyebrow"),
        t("faq.title", "Title"),
        list("faq.items", "Questions", [t("q", "Question"), ta("a", "Answer", { rows: 4 })], { itemTitle: "q" }),
      ],
    },
    ctaBlock,
  ],
};

export const platform = {
  label: "Platform",
  file: "pages/platform.json",
  kind: "object",
  groups: [
    ...seo,
    {
      title: "Hero",
      fields: [
        t("hero.eyebrow", "Eyebrow"),
        ta("hero.title", "Headline", { rows: 2 }),
        ta("hero.lede", "Intro", { rows: 4 }),
        link("hero.primary", "Primary button"),
        link("hero.secondary", "Secondary button"),
        t("hero.note", "Note"),
      ],
    },
    {
      title: "Dashboard intro",
      fields: [
        t("dashboard.eyebrow", "Eyebrow"),
        t("dashboard.title", "Title"),
        ta("dashboard.body", "Body", { rows: 3 }),
        t("dashboard.caption", "Caption"),
      ],
    },
    {
      title: "Features",
      fields: [
        t("features.eyebrow", "Eyebrow"),
        t("features.title", "Title"),
        list("features.items", "Features", [t("num", "Number"), t("title", "Title"), ta("body", "Text", { rows: 3 })], { itemTitle: "title" }),
      ],
    },
    {
      title: "For agents",
      fields: [
        t("agents.eyebrow", "Eyebrow"),
        ta("agents.title", "Title", { rows: 2 }),
        ta("agents.body", "Body", { rows: 3 }),
        list("agents.steps", "Steps", [t("num", "Number"), t("title", "Title"), ta("text", "Text", { rows: 3 })], { itemTitle: "title" }),
        link("agents.cta", "Button"),
      ],
    },
    {
      title: "For owners",
      fields: [
        t("owners.eyebrow", "Eyebrow"),
        ta("owners.title", "Title", { rows: 2 }),
        ta("owners.body", "Body", { rows: 3 }),
        img("owners.image", "Image"),
        t("owners.imageAlt", "Image alt text"),
        strings("owners.features", "Features"),
        link("owners.cta", "Button"),
      ],
    },
    {
      title: "Quote",
      fields: [ta("quote.text", "Quote", { rows: 4 }), t("quote.name", "Name"), t("quote.detail", "Detail")],
    },
    {
      title: "Access",
      fields: [
        t("access.eyebrow", "Eyebrow"),
        t("access.title", "Title"),
        ta("access.body", "Body", { rows: 3 }),
        link("access.primary", "Primary button"),
        link("access.secondary", "Secondary button"),
        t("access.note", "Note"),
      ],
    },
  ],
};

export const about = {
  label: "About",
  file: "pages/about.json",
  kind: "object",
  groups: [
    ...seo,
    {
      title: "Hero",
      fields: [
        t("hero.eyebrow", "Eyebrow"),
        ta("hero.title", "Headline", { rows: 2 }),
        ta("hero.lede", "Intro", { rows: 3 }),
        img("hero.image", "Image"),
        t("hero.imageAlt", "Image alt text"),
        strings("hero.badges", "Badges"),
      ],
    },
    {
      title: "Story",
      fields: [
        t("story.eyebrow", "Eyebrow"),
        ta("story.title", "Title", { rows: 3 }),
        strings("story.paragraphs", "Paragraphs"),
        img("story.image", "Image"),
        t("story.imageAlt", "Image alt text"),
        ta("story.pullquote", "Pull quote", { rows: 3 }),
      ],
    },
    {
      title: "What we do",
      fields: [
        t("values.eyebrow", "Eyebrow"),
        t("values.title", "Title"),
        list("values.items", "Values", [t("num", "Number"), t("title", "Title"), ta("body", "Text", { rows: 3 })], { itemTitle: "title", max: 4 }),
      ],
    },
    numberBlock,
    {
      title: "Offices",
      fields: [
        t("offices.eyebrow", "Eyebrow"),
        t("offices.title", "Title"),
        list("offices.items", "Locations", [t("place", "Place"), t("role", "Role"), t("detail", "Detail")], { itemTitle: "place" }),
      ],
    },
    ctaBlock,
  ],
};

export const contact = {
  label: "Contact",
  file: "pages/contact.json",
  kind: "object",
  groups: [
    ...seo,
    {
      title: "Hero",
      fields: [
        t("hero.eyebrow", "Eyebrow"),
        ta("hero.title", "Headline", { rows: 2 }),
        ta("hero.lede", "Intro", { rows: 3 }),
        img("hero.image", "Hero image"),
        t("hero.imageAlt", "Image alt text"),
      ],
    },
    {
      title: "Direct details",
      fields: [
        t("details.eyebrow", "Eyebrow"),
        t("details.title", "Title"),
        t("details.emailLabel", "Email label"),
        t("details.phoneLabel", "Phone label"),
        t("details.whatsappLabel", "WhatsApp label"),
        t("details.addressLabel", "Address label"),
        t("details.hoursLabel", "Hours label"),
        ta("details.hours", "Hours", { rows: 3 }),
        t("details.note", "Note"),
      ],
    },
    {
      title: "Form",
      fields: [
        t("form.title", "Title"),
        ta("form.body", "Body", { rows: 3 }),
        t("form.submitLabel", "Submit label"),
        ta("form.note", "Note", { rows: 3 }),
        strings("form.subjects", "Subjects"),
        t("form.success", "Success message"),
      ],
    },
    {
      title: "Photograph",
      fields: [img("image", "Image"), t("imageAlt", "Image alt text")],
    },
  ],
};

export const collection = {
  label: "Collection page",
  file: "pages/collection.json",
  kind: "object",
  groups: [
    ...seo,
    {
      title: "Hero",
      fields: [
        t("hero.eyebrow", "Eyebrow"),
        ta("hero.title", "Headline", { rows: 2 }),
        ta("hero.lede", "Intro", { rows: 4 }),
        img("hero.image", "Image"),
        t("hero.imageAlt", "Image alt text"),
      ],
    },
    {
      title: "Notes",
      fields: [
        ta("note", "Rate note", { rows: 3 }),
        t("filterLabel", "Filter label"),
        ta("empty", "No-results message", { rows: 3 }),
      ],
    },
  ],
};

export const destinationsPage = {
  label: "Destinations page",
  file: "pages/destinations.json",
  kind: "object",
  groups: [
    ...seo,
    {
      title: "Hero",
      fields: [
        t("hero.eyebrow", "Eyebrow"),
        ta("hero.title", "Headline", { rows: 2 }),
        ta("hero.lede", "Intro", { rows: 3 }),
        img("hero.image", "Image"),
        t("hero.imageAlt", "Image alt text"),
      ],
    },
    {
      title: "Introduction",
      fields: [t("intro.eyebrow", "Eyebrow"), ta("intro.title", "Title", { rows: 2 }), ta("intro.body", "Body", { rows: 3 })],
    },
  ],
};

export const legal = {
  label: "Legal",
  file: "pages/legal.json",
  kind: "object",
  groups: [
    {
      title: "Documents",
      fields: [
        list(
          "documents",
          "Pages",
          [
            t("slug", "URL slug"),
            t("title", "Title"),
            t("updated", "Last updated"),
            ta("intro", "Introduction", { rows: 3 }),
            list("sections", "Sections", [t("heading", "Heading"), strings("paragraphs", "Paragraphs")], { itemTitle: "heading" }),
          ],
          { itemTitle: "title" }
        ),
      ],
    },
  ],
};

export const SCHEMAS = {
  settings,
  home,
  villas: { ...villa, label: "Villa", file: "villas.json", kind: "array", itemLabel: "name" },
  destinations: { ...destination, label: "Destination", file: "destinations.json", kind: "array", itemLabel: "name" },
  testimonials,
  team,
  owners,
  platform,
  about,
  contact,
  collection,
  destinationsPage,
  legal,
};

export const NAV = [
  { key: "home", label: "Home", group: "Content" },
  { key: "villas", label: "Villas", group: "Content", badge: "count:villas" },
  { key: "destinations", label: "Destinations", group: "Content", badge: "count:destinations" },
  { key: "testimonials", label: "Testimonials", group: "Content" },
  { key: "team", label: "Team", group: "Content" },
  { key: "owners", label: "Owners", group: "Pages" },
  { key: "platform", label: "Platform", group: "Pages" },
  { key: "about", label: "About", group: "Pages" },
  { key: "contact", label: "Contact", group: "Pages" },
  { key: "collection", label: "Collection page", group: "Pages" },
  { key: "destinationsPage", label: "Destinations page", group: "Pages" },
  { key: "legal", label: "Legal", group: "Pages" },
  { key: "media", label: "Media", group: "System" },
  { key: "settings", label: "Settings", group: "System" },
];
