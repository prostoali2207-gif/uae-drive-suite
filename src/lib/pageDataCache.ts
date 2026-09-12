const PAGE_CACHE_PREFIX = "fleetdesk:page-cache:v1";
const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000;

interface PageCacheEntry<T> {
  savedAt: number;
  data: T;
}

function cacheKey(scope: string, userId: string): string {
  return `${PAGE_CACHE_PREFIX}:${userId}:${scope}`;
}

export function readPageCache<T>(
  scope: string,
  userId: string,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
): T | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(cacheKey(scope, userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PageCacheEntry<T>;
    if (!parsed || typeof parsed.savedAt !== "number" || !("data" in parsed)) {
      return null;
    }

    if (Date.now() - parsed.savedAt > maxAgeMs) {
      window.localStorage.removeItem(cacheKey(scope, userId));
      return null;
    }

    return parsed.data;
  } catch {
    return null;
  }
}

export function writePageCache<T>(scope: string, userId: string, data: T): void {
  if (typeof window === "undefined") return;

  try {
    const entry: PageCacheEntry<T> = {
      savedAt: Date.now(),
      data,
    };
    window.localStorage.setItem(cacheKey(scope, userId), JSON.stringify(entry));
  } catch {
    // Cache is an optimization only. A storage quota/privacy error must never block FleetDesk.
  }
}
