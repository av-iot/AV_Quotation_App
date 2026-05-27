// Nominatim geocoder with localStorage cache and 1-req/sec rate limit
const CACHE_KEY      = "av_geocache_v1";
const FAIL_CACHE_KEY = "av_geo_fail_v1";
const FAIL_TTL_MS    = 7 * 24 * 60 * 60 * 1000; // 7 days

type GeoCoords = { lat: number; lng: number };

function readCache(): Record<string, GeoCoords> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); }
  catch { return {}; }
}
function writeCache(c: Record<string, GeoCoords>) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {}
}

function readFailCache(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(FAIL_CACHE_KEY) || "{}"); }
  catch { return {}; }
}
function writeFailCache(c: Record<string, number>) {
  try { localStorage.setItem(FAIL_CACHE_KEY, JSON.stringify(c)); } catch {}
}

function isRecentlyFailed(key: string): boolean {
  const ts = readFailCache()[key];
  return !!ts && Date.now() - ts < FAIL_TTL_MS;
}
function markFailed(key: string) {
  const c = readFailCache();
  c[key] = Date.now();
  writeFailCache(c);
}

// Strip leading unit/flat prefix like "8/50," or "No. 8/50" from Sri Lankan addresses
function stripUnitPrefix(address: string): string | null {
  const simplified = address
    .replace(/^(no\.?\s*)?\d+\/\d+[\s,]+/i, "")
    .replace(/^#?\d+[\s,]+/, "")
    .trim();
  return simplified && simplified !== address && simplified.length > 5 ? simplified : null;
}

let lastReqAt = 0;

async function fetchNominatim(address: string): Promise<GeoCoords | null> {
  const wait = Math.max(0, 1100 - (Date.now() - lastReqAt));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastReqAt = Date.now();

  try {
    const q = encodeURIComponent(`${address}, Sri Lanka`);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=1&countrycodes=lk`,
      { headers: { Accept: "application/json" } }
    );
    const data: any[] = await res.json();
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
    return null;
  } catch {
    return null;
  }
}

export async function geocodeAddress(address: string): Promise<GeoCoords | null> {
  if (!address || address.trim().length < 5) return null;
  const key = address.toLowerCase().trim();

  // 1. Already succeeded
  const cached = readCache()[key];
  if (cached) return cached;

  // 2. Already failed recently — skip the API call
  if (isRecentlyFailed(key)) return null;

  // 3. Try original address
  let coords = await fetchNominatim(address);

  // 4. If failed, retry with unit prefix stripped (handles "8/50, Galle Rd" → "Galle Rd")
  if (!coords) {
    const simplified = stripUnitPrefix(address);
    if (simplified) {
      const simKey = simplified.toLowerCase().trim();
      const simCached = readCache()[simKey];
      if (simCached) {
        coords = simCached;
      } else if (!isRecentlyFailed(simKey)) {
        coords = await fetchNominatim(simplified);
        if (coords) {
          const c = readCache();
          c[simKey] = coords;
          writeCache(c);
        }
      }
    }
  }

  if (coords) {
    const c = readCache();
    c[key] = coords;
    writeCache(c);
    return coords;
  }

  // Cache the failure so we don't retry for 7 days
  markFailed(key);
  return null;
}

export function getCachedCoords(address: string): GeoCoords | null {
  if (!address) return null;
  const key = address.toLowerCase().trim();
  const direct = readCache()[key];
  if (direct) return direct;

  // Also check simplified variant in cache
  const simplified = stripUnitPrefix(address);
  if (simplified) {
    return readCache()[simplified.toLowerCase().trim()] ?? null;
  }
  return null;
}
