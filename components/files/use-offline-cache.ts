"use client";

import { useState, useEffect, useSyncExternalStore } from "react";

const CACHE_NAME = "basilissa-viewer-v1";

interface UseOfflineCacheOptions {
  urlsToCache?: (string | null | undefined)[];
  enabled?: boolean;
}

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getOnlineSnapshot() {
  return navigator.onLine;
}

function getServerOnlineSnapshot() {
  return true;
}

export function useOfflineCache({ urlsToCache = [], enabled = true }: UseOfflineCacheOptions = {}) {
  const isOnline = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerOnlineSnapshot);
  const [isCached, setIsCached] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined" || !enabled) return;

    // Register Service Worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw-viewer.js")
        .catch((err) => console.warn("ServiceWorker registration skipped:", err));
    }

    // Proactively preload & cache preview URLs in browser Cache Storage
    const validUrls = urlsToCache.filter((u): u is string => Boolean(u && typeof u === "string"));
    if ("caches" in window && validUrls.length > 0) {
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          await Promise.all(
            validUrls.map(async (url) => {
              const matched = await cache.match(url);
              if (!matched) {
                const response = await fetch(url, { mode: "cors" });
                if (response.ok) {
                  await cache.put(url, response.clone());
                }
              }
            })
          );
          setIsCached(true);
        } catch {
          // Non-blocking caching failure
        }
      });
    }
  }, [enabled, urlsToCache]);

  return { isOnline, isCached };
}
