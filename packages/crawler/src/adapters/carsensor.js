import { specMapToCanonical, dedupeById } from "../parseSpecs.js";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Extract the listing ID from a carsensor detail URL path.
 *  Pattern: /usedcar/detail/{ID}/index.html
 */
function listingIdFromUrl(url) {
  const m = String(url).match(/\/usedcar\/detail\/([A-Za-z0-9]+)\//);
  return m ? m[1] : null;
}

/** Make a relative href absolute for carsensor.net */
function toAbsolute(href) {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  return "https://www.carsensor.net" + href;
}

/** Normalise a JP table header key.
 *  Strips parenthetical suffixes like (初度登録年), trailing question-mark
 *  icons (empty <i>), and collapses whitespace so the key matches specLabels.
 */
function normaliseThKey(raw) {
  return raw
    .replace(/（.*?）|\(.*?\)/g, "")  // drop parentheticals
    .replace(/\s+/g, "")              // collapse whitespace
    .trim();
}

/** Map carsensor-specific label text to the canonical JP specLabels key.
 *  Some labels differ from the recognised keys — map them here so
 *  specMapToCanonical can find them in the dictionary.
 */
const LABEL_REMAP = {
  "色": "車体色",         // table uses "色", specLabels expects "車体色"
  "エンジン種別": "燃料", // "ガソリン" etc. maps via fuelType
};

function remapLabel(key) {
  return LABEL_REMAP[key] ?? key;
}

/** Extract maker + model from the listing title.
 *  Carsensor's <h1 class="title1"> leads with a text node "トヨタ ヤリス"
 *  (maker then model), followed by a nested <span> holding the grade/desc.
 *  We read the leading text node and take the first two whitespace-separated
 *  tokens. Returns { maker, model } with null for anything missing.
 *  Whitespace includes the JP full-width space (　).
 */
function makerModelFromTitle(doc) {
  const h1 = doc.querySelector("h1.title1");
  if (!h1) return { maker: null, model: null };
  // Concatenate leading text nodes (maker + model are separate text nodes
  // joined by a non-breaking space) up to the first element child (the grade
  // <span>), so the long grade/description text doesn't pollute the tokens.
  let lead = "";
  for (const node of h1.childNodes) {
    if (node.nodeType === 1) break; // element node => stop (grade span)
    lead += node.textContent;
  }
  if (!lead.trim()) return { maker: null, model: null };
  const tokens = lead.trim().split(/[\s　]+/).filter(Boolean);
  return { maker: tokens[0] || null, model: tokens[1] || null };
}

// ---------------------------------------------------------------------------
// detectFromUrl
// ---------------------------------------------------------------------------
function detectFromUrl(url) {
  try {
    return new URL(url).hostname.includes("carsensor.net");
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// buildSearchUrl
// ---------------------------------------------------------------------------
// Carsensor uses query-string params on /usedcar/search.php.
// The maker (brand) param is BDCD (brand code, e.g. "TO" for Toyota), but
// since we only have a free-form maker string and no code mapping here, we
// pass it as a best-effort BRDC param and include it in the q (keyword) param.
// NOTE: actual carsensor filtering requires session-based params; this URL
// serves as a starting point for a search session.
function buildSearchUrl(criteria = {}) {
  const base = "https://www.carsensor.net/usedcar/search.php";
  const params = new URLSearchParams();
  if (criteria.maker) {
    // BRDC is the standard brand-code param on carsensor search forms
    params.set("BRDC", String(criteria.maker).toUpperCase());
  }
  if (criteria.priceMax) {
    // PRICEHIGH is the upper-price filter param on carsensor
    params.set("PRICEHIGH", String(Math.round(criteria.priceMax / 10000)));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

function parseMakerOptions(doc) {
  return Array.from(doc.querySelectorAll(".modalMaker__maker .js_makerMenu"))
    .map((a) => {
      const label = a.getAttribute("title")?.trim() || a.textContent.replace(/\([^)]*\)/g, "").trim();
      const onclick = a.getAttribute("onclick") || a.getAttribute("onClick") || "";
      const code = onclick.match(/clickBrand\('([^']*)'/)?.[1] ?? "";
      if (!label || !code || label === "こだわらない") return null;
      return { site: "carsensor", code, label };
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// parseSearchPage
// ---------------------------------------------------------------------------
function parseSearchPage(doc) {
  // Listing links: all <a> whose href contains /usedcar/detail/
  const anchors = Array.from(doc.querySelectorAll('a[href*="/usedcar/detail/"]'));

  const raw = anchors
    .map((a) => {
      const href = a.getAttribute("href");
      if (!href || href.includes("#")) return null;
      const id = listingIdFromUrl(href);
      if (!id) return null;
      return { sourceListingId: id, url: toAbsolute(href) };
    })
    .filter(Boolean);

  const listingRefs = dedupeById(raw);

  // Next page: prefer <link rel="next"> in <head>, fall back to pager button
  let nextPageUrl = null;
  const relNext = doc.querySelector('link[rel="next"]');
  if (relNext) {
    nextPageUrl = toAbsolute(relNext.getAttribute("href"));
  } else {
    // Carsensor pager: <button class="pager__btn__next" onclick="location.href='...';...">
    const nextBtn = doc.querySelector(".pager__btn__next");
    if (nextBtn) {
      const onclick = nextBtn.getAttribute("onclick") || "";
      const m = onclick.match(/location\.href\s*=\s*['"]([^'"]+)['"]/);
      if (m) nextPageUrl = toAbsolute(m[1]);
    }
  }

  return { listingRefs, nextPageUrl };
}

// ---------------------------------------------------------------------------
// parseListingPage
// ---------------------------------------------------------------------------
async function parseListingPage(doc, url, deps) {
  const sourceListingId = listingIdFromUrl(url);
  const specMap = {};

  // --- 1. .specWrap > .specWrap__box summary boxes ---
  // Each box has: .specWrap__box__title (label) and a value in one of:
  //   .specWrap__box__num (numeric, e.g. year or mileage)
  //   .specWrap__boxDetail (text, e.g. 修復歴/車検)
  // We read every box and insert into specMap using the recognized JP key.
  const BOX_TITLE_TO_LABEL = {
    "年式": "年式",
    "走行距離": "走行距離",
    "修復歴": "修復歴",
    "車検有無": "車検",
    "地域": "地域",
  };

  for (const box of doc.querySelectorAll(".specWrap__box")) {
    const titleEl = box.querySelector(".specWrap__box__title");
    if (!titleEl) continue;
    const titleText = titleEl.textContent.trim();
    const jpLabel = BOX_TITLE_TO_LABEL[titleText];
    if (!jpLabel) continue;

    // Collect value text: prefer __box__num, then all __boxDetail texts joined
    const numEl = box.querySelector(".specWrap__box__num");
    const unitEl = box.querySelector(".specWrap__boxUnit");
    let value;
    if (numEl) {
      const num = numEl.textContent.trim();
      const unit = unitEl ? unitEl.textContent.trim() : "";
      value = num + unit;
    } else {
      const detailEls = box.querySelectorAll(".specWrap__boxDetail");
      value = Array.from(detailEls)
        .map((el) => el.textContent.trim().replace(/\s+/g, " "))
        .join(" ")
        .trim();
    }
    if (value && !specMap[jpLabel]) {
      specMap[jpLabel] = value;
    }
  }

  // --- 2. Price blocks ---
  // .totalPrice__price contains "<span>120</span>万円"
  const totalPriceEl = doc.querySelector(".totalPrice__price");
  if (totalPriceEl) {
    const raw = totalPriceEl.textContent.trim().replace(/\s+/g, "");
    if (raw) specMap["支払総額"] = raw;
  }
  // .basePrice__price has content attr with raw yen value OR span text
  // Prefer the content attribute (e.g. "1,136,000") for accuracy
  const basePriceEl = doc.querySelector(".basePrice__price");
  if (basePriceEl) {
    const contentAttr = basePriceEl.getAttribute("content");
    const raw = contentAttr
      ? contentAttr.replace(/,/g, "") + "円"
      : basePriceEl.textContent.trim().replace(/\s+/g, "");
    if (raw) specMap["車両本体価格"] = raw;
  }

  // --- 3. Detail spec tables: table.defaultTable__table tbody tr ---
  // Each <tr> can have MULTIPLE th/td pairs side by side (th, td, th, td...).
  // th text contains the label (may have parentheticals + icon anchors).
  // td text is the value.
  // Skip placeholder values: "－" or "-".
  for (const table of doc.querySelectorAll("table.defaultTable__table")) {
    for (const row of table.querySelectorAll("tbody tr")) {
      const cells = Array.from(row.children);
      let i = 0;
      while (i < cells.length) {
        const cell = cells[i];
        const tag = cell.tagName.toLowerCase();
        if (tag === "th") {
          const rawKey = cell.textContent.trim();
          const normKey = normaliseThKey(rawKey);
          const jpLabel = remapLabel(normKey);
          const tdCell = cells[i + 1];
          if (tdCell && tdCell.tagName.toLowerCase() === "td") {
            const value = tdCell.textContent.trim().replace(/\s+/g, " ").trim();
            if (jpLabel && value && value !== "－" && value !== "-" && !specMap[jpLabel]) {
              specMap[jpLabel] = value;
            }
            i += 2;
          } else {
            i += 1;
          }
        } else {
          i += 1;
        }
      }
    }
  }

  // --- 3b. Maker / model from the page title (not in the spec table) ---
  // Inject under the recognised specLabels keys so they canonicalize.
  const { maker, model } = makerModelFromTitle(doc);
  if (maker && !specMap["メーカー"]) specMap["メーカー"] = maker;
  if (model && !specMap["車名"]) specMap["車名"] = model;

  // --- 4. Translate to canonical ---
  const canonical = await specMapToCanonical(specMap, deps);

  // --- 5. Photos ---
  // Thumbnails use .js-photo anchor elements with data-photo (medium) and
  // data-photohq (high quality) attributes. Collect data-photohq first,
  // fall back to data-photo. Exclude non-car images (shop banners etc.)
  // by filtering to actual photo CDN URLs (ccsrpcma = main car photos).
  const photoSet = new Set();

  // og:image is the primary photo
  const ogImage = doc.querySelector('meta[property="og:image"]');
  if (ogImage) {
    const src = ogImage.getAttribute("content");
    if (src && src.includes("carsensor.net")) photoSet.add(src);
  }

  // Slide photo anchors (.js-photo) carry data-photohq (full-res) and data-photo
  for (const anchor of doc.querySelectorAll(".js-photo[data-photo]")) {
    const hq = anchor.getAttribute("data-photohq");
    const med = anchor.getAttribute("data-photo");
    const src = hq || med;
    if (!src) continue;
    // Only include actual car photos from the carsensor CDN (not /cmn/ site images)
    if (src.startsWith("/cmn/") || src.startsWith("/help/")) continue;
    if (src.includes("carsensor.net") || src.startsWith("https://ccsrpc")) {
      photoSet.add(src.split("?")[0]); // strip query params
    }
  }

  // Also pick up the main image via #js-mainPhoto
  const mainPhoto = doc.querySelector("#js-mainPhoto");
  if (mainPhoto) {
    const src = mainPhoto.getAttribute("data-photo") || mainPhoto.getAttribute("src");
    if (src && (src.includes("carsensor.net") || src.startsWith("https://ccsrpc"))) {
      photoSet.add(src.split("?")[0]);
    }
  }

  const photos = Array.from(photoSet);

  // --- 6. Description ---
  // .shopComment contains the vehicle condition comment from the appraiser
  const descEl = doc.querySelector(".shopComment");
  const descriptionOriginal = descEl ? descEl.textContent.trim() || null : null;

  return {
    source: "carsensor",
    sourceListingId,
    url,
    ...canonical,
    photos,
    descriptionOriginal,
    raw: { specMap },
  };
}

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------
export const carsensor = {
  site: "carsensor",
  makerListUrl: "https://www.carsensor.net/usedcar/search.php",
  detectFromUrl,
  buildSearchUrl,
  parseMakerOptions,
  parseSearchPage,
  parseListingPage,
};
