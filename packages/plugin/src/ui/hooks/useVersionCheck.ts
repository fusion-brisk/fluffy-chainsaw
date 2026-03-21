/**
 * useVersionCheck — checks relay/extension versions against remote manifest
 *
 * Fetches versions.json from GitHub on mount, then compares current
 * relay and extension versions to determine if updates are needed.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const VERSIONS_URL = 'https://raw.githubusercontent.com/fusion-brisk/fluffy-chainsaw/main/versions.json';
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
  requirements: VersionRequirements | undefined
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
  extensionVersion: string | null
): UseVersionCheckReturn {
  const [manifest, setManifest] = useState<VersionManifest | null>(null);
  const [relayDismissed, setRelayDismissed] = useState(false);
  const [extensionDismissed, setExtensionDismissed] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    fetch(VERSIONS_URL, { signal: controller.signal })
      .then(res => {
        clearTimeout(timeoutId);
        if (!res.ok) return null;
        return res.json();
      })
      .then(data => {
        if (data?.relay && data?.extension) {
          setManifest(data as VersionManifest);
        }
      })
      .catch(() => {
        // Silently fail — version check is best-effort
      });

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  const relayUpdate = relayDismissed ? null : checkVersion(relayVersion, manifest?.relay);
  const extensionUpdate = extensionDismissed ? null : checkVersion(extensionVersion, manifest?.extension);

  // Critical updates cannot be dismissed
  const dismissRelay = useCallback(() => {
    if (!relayUpdate?.critical) setRelayDismissed(true);
  }, [relayUpdate?.critical]);

  const dismissExtension = useCallback(() => {
    if (!extensionUpdate?.critical) setExtensionDismissed(true);
  }, [extensionUpdate?.critical]);

  return { relayUpdate, extensionUpdate, dismissRelay, dismissExtension };
}
