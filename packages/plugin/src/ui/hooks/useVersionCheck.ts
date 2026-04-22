/**
 * useVersionCheck — checks extension version against remote manifest.
 *
 * Cloud-relay deploy does not require client-side version gating (YC Function
 * always runs latest). This hook is extension-only now.
 *
 * Plugin self-update goes via Figma Community, so no version check is needed
 * for the plugin itself either.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const VERSIONS_URL_GITHUB =
  'https://raw.githubusercontent.com/fusion-brisk/fluffy-chainsaw/main/versions.json';
const FETCH_TIMEOUT_MS = 5000;

interface VersionRequirements {
  latest: string;
  minimum: string;
  downloadUrl: string;
}

interface VersionManifest {
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
  extensionUpdate: UpdateInfo | null;
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

export function useVersionCheck(extensionVersion: string | null): UseVersionCheckReturn {
  const [manifest, setManifest] = useState<VersionManifest | null>(null);
  const [extensionDismissed, setExtensionDismissed] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const fetchVersions = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const res = await fetch(VERSIONS_URL_GITHUB, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) return;
        const data = await res.json();
        if (data?.extension) {
          setManifest(data as VersionManifest);
        }
      } catch {
        // Network failure — skip version check silently
      }
    };

    fetchVersions();
  }, []);

  const extensionUpdate = extensionDismissed
    ? null
    : checkVersion(extensionVersion, manifest?.extension);

  // Critical updates cannot be dismissed
  const dismissExtension = useCallback(() => {
    if (!extensionUpdate?.critical) setExtensionDismissed(true);
  }, [extensionUpdate?.critical]);

  return { extensionUpdate, dismissExtension };
}
