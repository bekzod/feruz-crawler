import { specMapToCanonical, dedupeById } from "../parseSpecs.js";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Extract the car-id (21-digit number) from a detail URL path segment. */
function carIdFromUrl(url) {
  const m = String(url).match(/\/usedcar\/spread\/goo\/\d+\/(\d+)\.html/);
  return m ? m[1] : null;
}

/** Make a relative href absolute for goo-net.com */
function toAbsolute(href) {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  return "https://www.goo-net.com" + href;
}

// ---------------------------------------------------------------------------
// detectFromUrl
// ---------------------------------------------------------------------------
function detectFromUrl(url) {
  try {
    return new URL(url).hostname.includes("goo-net.com");
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// buildSearchUrl
// ---------------------------------------------------------------------------
// Only maker→uppercase brand segment is wired.
// Price/year/mileage range params are NOT appended — goo-net uses dynamic
// AJAX filters rather than clean query params on the list URL.
function buildSearchUrl(criteria = {}) {
  const maker = criteria.maker ? criteria.maker.toUpperCase() : null;
  if (maker) {
    return `https://www.goo-net.com/usedcar/brand-${maker}/list/`;
  }
  return "https://www.goo-net.com/usedcar/all/list/";
}

// ---------------------------------------------------------------------------
// parseSearchPage
// ---------------------------------------------------------------------------
function parseSearchPage(doc) {
  // Listing links: all <a> whose href contains /usedcar/spread/
  const anchors = Array.from(doc.querySelectorAll('a[href*="/usedcar/spread/"]'));

  const raw = anchors
    .map((a) => {
      const href = a.getAttribute("href");
      // Only plain detail pages (no hash fragments)
      if (!href || href.includes("#")) return null;
      const id = carIdFromUrl(href);
      if (!id) return null;
      return { sourceListingId: id, url: toAbsolute(href) };
    })
    .filter(Boolean);

  const listingRefs = dedupeById(raw);

  // Next page: prefer <link rel="next"> in <head>, fallback to pager <li class="next"> > a
  let nextPageUrl = null;
  const relNext = doc.querySelector('link[rel="next"]');
  if (relNext) {
    nextPageUrl = toAbsolute(relNext.getAttribute("href"));
  } else {
    const nextLi = doc.querySelector("li.next a");
    if (nextLi) nextPageUrl = toAbsolute(nextLi.getAttribute("href"));
  }

  return { listingRefs, nextPageUrl };
}

// ---------------------------------------------------------------------------
// parseListingPage
// ---------------------------------------------------------------------------
async function parseListingPage(doc, url, deps) {
  const sourceListingId = carIdFromUrl(url);
  const specMap = {};

  // --- 1. ul.subData summary bar ---
  // Each <li> has a class that maps to a known JP label, plus two <span>:
  //   first = JP label text, second = value text.
  // We map by class to ensure the correct JP key (the li's own label text
  // may contain whitespace / ruby), then use the second span's text as value.
  const CLASS_TO_LABEL = {
    mode: "年式",
    mile: "走行距離",
    vehi: "車検",
    repa: "修復歴",
    engi: "排気量",
    color: "車体色",
  };

  for (const [cls, jpLabel] of Object.entries(CLASS_TO_LABEL)) {
    const li = doc.querySelector(`ul.subData li.${cls}`);
    if (!li) continue;
    const spans = li.querySelectorAll("span");
    // spans[0] = label, spans[1] = value (may have nested spans)
    // For "mode" (年式) the value span has structure:
    //   <span class="year"><span>2018</span><br>(平成30)年</span>
    // For "mile" the km span wraps <span>5.2</span>万km
    // We grab all text content of the second span
    const valueEl = spans[1] || spans[0];
    if (!valueEl) continue;
    const raw = valueEl.textContent.trim().replace(/\s+/g, " ");
    if (raw) specMap[jpLabel] = raw;
  }

  // --- 2. .mainDataList price blocks ---
  // Structure: .mainDataList > div.txt (label) + div.num (value)
  for (const block of doc.querySelectorAll(".mainDataList")) {
    const txtEl = block.querySelector(".txt");
    const numEl = block.querySelector(".num");
    if (!txtEl || !numEl) continue;
    // Label text may have extra spans/images — grab just the first text node
    // or the <span> text. We look for known JP price labels.
    const labelRaw = txtEl.textContent.trim().replace(/\s+/g, "");
    // Normalise: strip parenthetical suffixes like (税込)(リ済込)
    const label = labelRaw.replace(/（.*?）|\(.*?\)/g, "").trim();
    const value = numEl.textContent.trim().replace(/\s+/g, "");
    if (label && value && !specMap[label]) {
      specMap[label] = value;
    }
  }

  // --- 3. Detail spec tables (.tbl_type01): th/td pairs ---
  for (const table of doc.querySelectorAll("table.tbl_type01")) {
    for (const row of table.querySelectorAll("tr")) {
      const ths = row.querySelectorAll("th");
      const tds = row.querySelectorAll("td");
      for (let i = 0; i < ths.length && i < tds.length; i++) {
        const k = ths[i].textContent.trim().replace(/\s+/g, "");
        const v = tds[i].textContent.trim().replace(/\s+/g, " ").trim();
        if (k && v && v !== "－" && v !== "-" && !specMap[k]) {
          specMap[k] = v;
        }
      }
    }
  }

  // --- 4. Translate to canonical ---
  const canonical = await specMapToCanonical(specMap, deps);

  // --- 5. Photos ---
  // Collect src/data-lazy/data-original from slick-slide images inside #photoGalleryTop
  // that point to picture1.goo-net.com (actual car photos, not shop/warranty images)
  const photoSet = new Set();

  // og:image is always the primary photo
  const ogImage = doc.querySelector('meta[property="og:image"]');
  if (ogImage) {
    const src = ogImage.getAttribute("content");
    if (src && src.includes("picture1.goo-net.com")) photoSet.add(src);
  }

  // Slide images: prefer src (loaded), then data-lazy (lazy-loaded)
  for (const img of doc.querySelectorAll("#photoGalleryTop .item.image img")) {
    const src = img.getAttribute("src") || img.getAttribute("data-lazy");
    if (src && src.includes("picture1.goo-net.com")) photoSet.add(src);
  }

  // Thumbnails from slick-thumb as fallback
  for (const img of doc.querySelectorAll(".slick-thumb img")) {
    const src = img.getAttribute("src");
    if (src && src.includes("picture1.goo-net.com")) photoSet.add(src);
  }

  const photos = Array.from(photoSet);

  // --- 6. Description ---
  // div.prBlock > p contains the seller's summary text
  const descEl = doc.querySelector(".prBlock p");
  const descriptionOriginal = descEl ? descEl.textContent.trim() || null : null;

  return {
    source: "goonet",
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
export const goonet = {
  site: "goonet",
  detectFromUrl,
  buildSearchUrl,
  parseSearchPage,
  parseListingPage,
};
