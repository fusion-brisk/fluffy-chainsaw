/**
 * useVersionCheck — checks relay/extension versions against remote manifest
 *
 * Fetches versions.json via relay proxy first (avoids CORS in Figma iframe),
 * falls back to GitHub raw URL if relay is unavailable.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// Try relay proxy first — avoids CORS issues in Figma plugin iframe
const VERSIONS_URL_RELAY = 'http://localhost:3847/versions';
const VERSIONS_URL_GITHUB =
  'https://raw.githubusercontent.com/fusion-brisk/fluffy-chainsaw/main/versions.json';
const FETCH_TIMEOUT_MS = 5000;

interface VersionRequirements {
  latest: string;
  minimum: string;
  downloadUrl: string;
}

interface VersionManifest {
  relay: VersionRequirements;
  extension: VersionRequirements;
}

export interface UpdateInfo {
  current: string;
  latest: string;
  downloadUrl: string;
  /** true = below minimum (critical), false = below latest (optional) */
  critical: boolean;
}

export interface UseVersionCheckReturn {
  relayUpdate: UpdateInfo | null;
  extensionUpdate: UpdateInfo | null;
  dismissRelay: () => void;
  dismissExtension: () => void;
}

function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function checkVersion(
  current: string | null,
  requirements: VersionRequirements | undefined,
): UpdateInfo | null {
  if (!current || !requirements) return null;

  const belowMinimum = compareSemver(current, requirements.minimum) < 0;
  const belowLatest = compareSemver(current, requirements.latest) < 0;

  if (!belowMinimum && !belowLatest) return null;

  return {
    current,
    latest: requirements.latest,
    downloadUrl: requirements.downloadUrl,
    critical: belowMinimum,
  };
}

export function useVersionCheck(
  relayVersion: string | null,
  extensionVersion: string | null,
): UseVersionCheckReturn {
  const [manifest, setManifest] = useState<VersionManifest | null>(null);
  const [relayDismissed, setRelayDismissed] = useState(false);
  const [extensionDismissed, setExtensionDismissed] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const fetchVersions = async () => {
      // Try relay proxy first, then GitHub direct
      for (const url of [VERSIONS_URL_RELAY, VERSIONS_URL_GITHUB]) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
          const res = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (!res.ok) continue;
          const data = await res.json();
          if (data?.relay && data?.extension) {
            setManifest(data as VersionManifest);
            return;
          }
        } catch {
          // Try next URL
        }
      }
    };

    fetchVersions();
  }, []);

  const relayUpdate = relayDismissed ? null : checkVersion(relayVersion, manifest?.relay);

  // Extension update: override downloadUrl to use local relay CRX cache
  const extensionUpdateRaw = extensionDismissed
    ? null
    : checkVersion(extensionVersion, manifest?.extension);
  const extensionUpdate = extensionUpdateRaw
    ? { ...extensionUpdateRaw, downloadUrl: 'http://localhost:3847/extension.crx' }
    : null;

  // Critical updates cannot be dismissed
  const dismissRelay = useCallback(() => {
    if (!relayUpdate?.critical) setRelayDismissed(true);
  }, [relayUpdate?.critical]);

  const dismissExtension = useCallback(() => {
    if (!extensionUpdate?.critical) setExtensionDismissed(true);
  }, [extensionUpdate?.critical]);

  return { relayUpdate, extensionUpdate, dismissRelay, dismissExtension };
}
