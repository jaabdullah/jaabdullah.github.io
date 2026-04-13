const EMAIL_CONTACT = "jabdullah@us.es";
let PUB_ORCID = ""; // configured in /data/profile.json

async function loadProfile() {
  // Fetching local JSON via `file://` is blocked in most browsers.
  // If you are opening index.html directly, run a local server (VSCode Live Server or `python -m http.server`).
  if (window.location && window.location.protocol === "file:") {
    return { __error: "file_protocol" };
  }
  try {
    const r = await fetch("data/profile.json", { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return { __error: "fetch_failed", __detail: String(e && e.message ? e.message : e) };
  }
}

const pubBody = document.getElementById("pubBody");
const searchInput = document.getElementById("pubSearch");
const typeSelect = document.getElementById("pubType");
const sortYearBtn = document.getElementById("sortYear");
const sortCitationsBtn = document.getElementById("sortCitations");
let currentSort = "year"; // default: newest first

let allRows = []; // cached normalized items

function upsertAddition(rows, add) {
  if (!add?.title) return rows;
  const titleKey = String(add.title);
  const urlKey = add.url ? String(add.url) : null;
  const idx = rows.findIndex(
    r => String(r.title || "") === titleKey || (urlKey && String(r.url || "") === urlKey)
  );

  const normalizedType = normalizeOAType(add.type || "other");

  if (idx === -1) {
    rows.push({
      title: add.title,
      year: add.year || null,
      source: add.source || "",
      doi: add.doi || null,
      url: add.url || "",
      citations: Number(add.citations || 0),
      type: normalizedType,
      typeLabel: add.typeLabel || openalexTypeLabel(normalizedType)
    });
    return rows;
  }

  // If it already exists and the addition is marked as force, update the existing entry.
  if (add.force) {
    rows[idx] = {
      ...rows[idx],
      title: add.title || rows[idx].title,
      year: add.year || rows[idx].year,
      source: add.source || rows[idx].source,
      doi: add.doi ?? rows[idx].doi,
      url: add.url || rows[idx].url,
      citations: Number(add.citations ?? rows[idx].citations ?? 0),
      type: normalizedType || rows[idx].type,
      typeLabel: add.typeLabel || openalexTypeLabel(normalizedType) || rows[idx].typeLabel
    };
  }
  return rows;
}

async function loadPublicationOverrides() {
  try {
    const r = await fetch(`data/publication_overrides.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return { overrides: [], additions: [] };
    const j = await r.json();
    return { overrides: j.overrides || [], additions: j.additions || [] };
  } catch {
    return { overrides: [], additions: [] };
  }
}

function applyPublicationOverrides(rows, overrides) {
  const out = rows.map(r => ({ ...r }));
  for (const rule of (overrides || [])) {
    const match = rule?.match || {};
    const set = rule?.set || {};
    for (const p of out) {
      const title = String(p.title || "");
      const url = String(p.url || "");
      const norm = (s) => String(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      const titleOk = match.title_contains ? norm(title).includes(norm(match.title_contains)) : true;
      const urlOk = match.url ? url === match.url : true;
      const doiOk = match.doi ? String(p.doi || "") === String(match.doi) : true;

      if (titleOk && urlOk && doiOk) {
        Object.assign(p, set);
        p.type = normalizeOAType(p.type || "other");
        p.typeLabel = openalexTypeLabel(p.type);
      }
    }
  }
  return out;
}

function normalizeType(orcidType) {
  if (!orcidType) return "other";
  const t = String(orcidType).toLowerCase().trim();

  if (t === "paratext") return "other";
  if (t.includes("review")) return "review";
  if (t.includes("journal")) return "article";
  if (t.includes("conference") || t.includes("proceedings")) return "proceedings-article";
  if (t.includes("book-chapter")) return "book-chapter";
  if (t.includes("dissertation") || t.includes("thesis")) return "dissertation";
  if (t.includes("book")) return "book";
  if (t.includes("preprint") || t.includes("posted-content")) return "preprint";

  return "other";
}

function doiFromUrl(url) {
  if (!url) return null;
  const m = String(url).match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
  return m ? m[0] : null;
}

async function loadMetricOverrides() {
  try {
    const r = await fetch(`data/metrics_override.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function applyOverridesToCounts(countsByYear, overrides) {
  if (!overrides?.citationsByYearOverrides) return countsByYear;
  const map = new Map((countsByYear || []).map(x => [String(x.year), { ...x }]));
  for (const [year, val] of Object.entries(overrides.citationsByYearOverrides)) {
    const y = String(year);
    const item = map.get(y) || { year: Number(y) };
    item.cited_by_count = Number(val);
    map.set(y, item);
  }
  return Array.from(map.values()).sort((a, b) => a.year - b.year);
}

async function fetchJson(url, headers = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);
  const r = await fetch(url, { headers, signal: controller.signal });
  clearTimeout(t);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

function typeLabel(t) {
  const map = {
    "article": "Article",
    "review": "Review",
    "proceedings-article": "Conference paper",
    "posted-content": "Preprint",
    "book-chapter": "Book chapter",
    "dissertation": "Thesis",
    "book": "Book",
    "preprint": "Preprint",
    other: "Other"
  };
  const key = String(t || "other").toLowerCase();
  return map[key] || "Other";
}

function render(rows) {
  if (!rows.length) {
    pubBody.innerHTML = `<tr><td colspan="6" class="muted">No results.</td></tr>`;
    return;
  }

  pubBody.innerHTML = rows.map(r => {
    const title = r.url
      ? `<a class="pubTitle" href="${r.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(stripTags(r.title || "Untitled"))}</a>`
      : escapeHtml(stripTags(r.title || "Untitled"));

    const doiLink = r.doi
      ? `<a class="pubDoi" href="https://doi.org/${r.doi}" target="_blank" rel="noopener noreferrer">${r.doi}</a>`
      : `<span class="muted">—</span>`;

    return `
      <tr>
        <td>${escapeHtml(r.typeLabel)}</td>
        <td>${escapeHtml(String(r.year || "—"))}</td>
        <td>${title}</td>
        <td>${escapeHtml(r.source || "—")}</td>
        <td class="num">${escapeHtml(String((r.citations ?? 0)))}</td>
        <td>${doiLink}</td>
      </tr>
    `;
  }).join("");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stripTags(s) {
  return String(s ?? "").replace(/<[^>]*>/g, "");
}

function sortRows(rows) {
  const list = [...rows];
  if (currentSort === "citations") {
    list.sort((a, b) =>
      (Number(b.citations || 0) - Number(a.citations || 0)) ||
      (Number(b.year || 0) - Number(a.year || 0)) ||
      String(a.title || "").localeCompare(String(b.title || ""))
    );
  } else {
    list.sort((a, b) =>
      (Number(b.year || 0) - Number(a.year || 0)) ||
      String(a.title || "").localeCompare(String(b.title || ""))
    );
  }
  return list;
}

function setSort(mode) {
  currentSort = mode;
  if (sortYearBtn && sortCitationsBtn) {
    sortYearBtn.classList.toggle("is-active", mode === "year");
    sortCitationsBtn.classList.toggle("is-active", mode === "citations");
  }
  applyFilters();
}

function applyFilters() {
  const q = (searchInput.value || "").toLowerCase().trim();
  const t = String(typeSelect.value || "all").toLowerCase();

  const known = ["article", "review", "proceedings-article", "book-chapter", "dissertation", "book", "preprint"];

  const filtered = allRows.filter(r => {
    const rowType = normalizeOAType(r?.type || r?.typeLabel || "");

    const matchesType = (t === "all")
      ? true
      : (t === "other")
        ? !known.includes(rowType)
        : rowType === t;

    const hay = `${r.title} ${r.source} ${r.doi} ${r.year} ${r.typeLabel}`.toLowerCase();
    const matchesQuery = q ? hay.includes(q) : true;
    return matchesType && matchesQuery;
  });

  render(sortRows(filtered));
}

async function fetchAllOpenAlexWorks() {
  const cacheKey = `oa_works_${PUB_ORCID}`;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    try {
      const c = JSON.parse(localStorage.getItem(cacheKey) || "null");
      if (c?.items?.length) return c.items;
    } catch (_) {}
  }

  const items = [];
  let cursor = "*";
  const orcidUrl = `https://orcid.org/${PUB_ORCID}`;
  const base = `https://api.openalex.org/works?filter=authorships.author.orcid:${encodeURIComponent(orcidUrl)}&per-page=200&cursor=`;

  while (cursor) {
    const url = base + encodeURIComponent(cursor);
    const data = await fetchJson(url, { "Accept": "application/json" });
    const results = data?.results || [];
    for (const w of results) items.push(w);
    cursor = data?.meta?.next_cursor || null;
    if (items.length > 2000) break;
  }

  try { localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), items })); } catch (_) {}
  return items;
}

function normalizeOAType(t) {
  if (!t) return "other";
  const s = String(t).toLowerCase().trim();

  if (s === "paratext") return "other";
  if (s.includes("posted") || s === "posted-content") return "preprint";
  if (s.includes("review")) return "review";
  if (s.includes("conference") || s.includes("proceedings")) return "proceedings-article";
  if (s.includes("book-chapter")) return "book-chapter";
  if (s.includes("dissertation") || s.includes("thesis")) return "dissertation";
  if (s === "book" || s.includes("book")) return "book";
  if (s.includes("journal-article") || (s.includes("journal") && s.includes("article"))) return "article";
  if (s.includes("preprint")) return "preprint";

  if (["article", "review", "preprint", "book", "book-chapter", "proceedings-article", "dissertation"].includes(s)) {
    return s;
  }

  return "other";
}
function looksLikeReview(title = "", source = "") {
  const text = `${title} ${source}`.toLowerCase();

  const reviewPatterns = [
    " review",
    "systematic review",
    "critical review",
    "mini review",
    "minireview",
    "state-of-the-art",
    "state of the art",
    "overview",
    "bibliometric",
    "meta-analysis",
    "meta analysis",
    "scoping review",
    "narrative review"
  ];

  return reviewPatterns.some(p => text.includes(p));
}
function openalexTypeLabel(t) {
  if (!t) return "Other";
  const map = {
    article: "Article",
    review: "Review",
    preprint: "Preprint",
    book: "Book",
    "book-chapter": "Book chapter",
    "proceedings-article": "Conference paper",
    "posted-content": "Preprint",
    dissertation: "Thesis",
    dataset: "Dataset",
    other: "Other"
  };
  const key = normalizeOAType(t);
  return map[key] || "Other";
}

function normalizeFromOpenAlex(w) {
  const doi = w?.doi ? doiFromUrl(w.doi) : null;
  const year = w?.publication_year || null;
  const title = w?.title || "";
  const source = w?.host_venue?.display_name || "";
  const url = w?.primary_location?.landing_page_url || (doi ? `https://doi.org/${doi}` : "");
  let type = normalizeOAType(w?.type);

if (type === "article" && looksLikeReview(w?.title || "", w?.host_venue?.display_name || "")) {
  type = "review";
}

const typeLabel = openalexTypeLabel(type);
  const citations = Number.isFinite(Number(w?.cited_by_count)) ? Number(w.cited_by_count) : 0;

  return { title, source, year, doi, url, citations, type: type || "other", typeLabel };
}

async function loadPublications() {
  try {
    const profile = await loadProfile();

    if (profile?.__error === "file_protocol") {
      pubBody.innerHTML = `<tr><td colspan="6" class="muted">Publications cannot load when opened via <code>file://</code>. Please run a local server (e.g., VSCode Live Server) and open the site via <code>http://localhost</code>.</td></tr>`;
      return;
    }
    if (profile?.__error === "fetch_failed") {
      pubBody.innerHTML = `<tr><td colspan="6" class="muted">Could not load <code>data/profile.json</code>. Please run a local server and check the browser console.</td></tr>`;
      return;
    }

    PUB_ORCID = String(profile?.orcid || PUB_ORCID || "").replaceAll("https://orcid.org/", "").trim();
    if (!PUB_ORCID) {
      pubBody.innerHTML = `<tr><td colspan="6" class="muted">Please set your PUB_ORCID in <code>data/profile.json</code>.</td></tr>`;
      return;
    }

    pubBody.innerHTML = `<tr><td colspan="6" class="muted">Fetching publications…</td></tr>`;

    const pubFixes = await loadPublicationOverrides();

    const cacheKey = `ny_pubs_${PUB_ORCID}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      const ageH = (Date.now() - parsed.ts) / 36e5;
      const hasCitationsField = Array.isArray(parsed.items) && parsed.items.every(it => typeof it?.citations === "number");

      if (ageH < 24 && Array.isArray(parsed.items) && hasCitationsField) {
        let cachedRows = Array.isArray(parsed.items) ? parsed.items : [];
        cachedRows = applyPublicationOverrides(cachedRows, pubFixes.overrides);
        for (const add of (pubFixes.additions || [])) upsertAddition(cachedRows, add);

        cachedRows.sort((a, b) =>
          (Number(b.year || 0) - Number(a.year || 0)) ||
          String(a.title).localeCompare(String(b.title))
        );

        allRows = cachedRows;
        localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), items: allRows }));
        applyFilters();
        return;
      }
    }

    let rows = [];

    try {
      const oaWorks = await fetchAllOpenAlexWorks();
      rows = oaWorks.map(normalizeFromOpenAlex);
    } catch (e) {
      rows = [];
    }

    if (!rows.length) {
      const works = await fetchJson(`https://pub.orcid.org/v3.0/${PUB_ORCID}/works`, { "Accept": "application/json" });
      const groups = works?.group || [];
      const summaries = [];

      for (const g of groups) {
        const list = g?.["work-summary"] || [];
        const ws = pickBestSummary(list);
        if (!ws) continue;

        const title = ws?.title?.title?.value || "";
        const year = ws?.["publication-date"]?.year?.value || null;
        const type = normalizeType(ws?.type);

        const extIds = ws?.["external-ids"]?.["external-id"] || [];
        let doi = null;
        for (const e of extIds) {
          if (String(e?.["external-id-type"]).toLowerCase() === "doi") {
            doi = e?.["external-id-value"] || null;
            break;
          }
        }

        let url = "";
        if (doi) url = `https://doi.org/${doi}`;
        else if (ws?.url?.value) url = ws.url.value;

        summaries.push({
          title,
          source: "",
          year,
          doi,
          url,
          citations: 0,
          type,
          typeLabel: typeLabel(type)
        });
      }
      rows = summaries;
    }

    let enriched = [];
    for (const r of rows) {
      if (r.doi && (!r.source || !r.year)) {
        try {
          const meta = await crossrefMeta(r.doi);

          const finalType = (
            r.type &&
            r.type !== "other" &&
            r.type !== "article"
          )
            ? r.type
            : normalizeOAType(meta?.type || r.type);

          enriched.push({
            ...r,
            ...meta,
            type: finalType,
            typeLabel: openalexTypeLabel(finalType)
          });
          continue;
        } catch (_) { /* ignore */ }
      }

      const finalType = normalizeOAType(r.type);
      enriched.push({
        ...r,
        type: finalType,
        typeLabel: openalexTypeLabel(finalType)
      });
    }

    enriched = applyPublicationOverrides(enriched, pubFixes.overrides);
    for (const add of (pubFixes.additions || [])) upsertAddition(enriched, add);

    enriched.sort((a, b) =>
      (Number(b.year || 0) - Number(a.year || 0)) ||
      String(a.title).localeCompare(String(b.title))
    );

    allRows = enriched;
    localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), items: allRows }));
    applyFilters();
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    pubBody.innerHTML = `<tr><td colspan="6" class="muted">Could not load publications. <span class="muted">(${escapeHtml(msg)})</span></td></tr>`;
  }
}

function pickBestSummary(list) {
  let best = null;

  for (const ws of list) {
    const year = Number(ws?.["publication-date"]?.year?.value || 0);
    const extIds = ws?.["external-ids"]?.["external-id"] || [];
    const hasDoi = extIds.some(e =>
      String(e?.["external-id-type"]).toLowerCase() === "doi" && e?.["external-id-value"]
    );
    const score = (hasDoi ? 1000 : 0) + (year ? year : 0);

    if (!best || score > best.score) best = { ws, score };
  }
  return best?.ws || list[0] || null;
}

if (searchInput) searchInput.addEventListener("input", applyFilters);
if (typeSelect) typeSelect.addEventListener("change", applyFilters);
if (sortYearBtn) sortYearBtn.addEventListener("click", () => setSort("year"));
if (sortCitationsBtn) sortCitationsBtn.addEventListener("click", () => setSort("citations"));

loadPublications();
