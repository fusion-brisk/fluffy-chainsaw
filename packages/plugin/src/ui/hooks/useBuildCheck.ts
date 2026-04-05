/**
 * useBuildCheck — polls relay /build-hash to detect stale plugin builds.
 *
 * Compares the build hash baked into this bundle (BUILD_HASH from config.ts)
 * against the hash relay reads from the latest dist/code.js on disk.
 * If they differ, sets buildStale=true.
 */

import { useEffect, useRef, useState } from 'react';
import { BUILD_HASH } from '../../config';

const POLL_INTERVAL_MS = 10_000;
const FETCH_TIMEOUT_MS = 3000;

export interface UseBuildCheckReturn {
  /** true when relay reports a different hash than the one baked into this bundle */
  buildStale: boolean;
}

export function useBuildCheck(relayUrl: string, enabled: boolean): UseBuildCheckReturn {
  const [buildStale, setBuildStale] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Don't poll if disabled, already stale, or hash is the raw placeholder
    // Split the placeholder so @rollup/plugin-replace doesn't substitute it
    if (!enabled || buildStale || BUILD_HASH === '__BUILD_' + 'HASH__') return;

    const check = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const res = await fetch(`${relayUrl}/build-hash`, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) return;
        const data = await res.json();
        if (data.hash && data.hash !== BUILD_HASH) {
          setBuildStale(true);
        }
      } catch {
        // Relay unavailable — silently ignore
      }
    };

    // Initial check after short delay (let relay settle)
    const initialTimeout = setTimeout(check, 2000);
    intervalRef.current = setInterval(check, POLL_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [relayUrl, enabled, buildStale]);

  return { buildStale };
}
