/**
 * useBuildCheck — no-op since the cloud relay has no `/build-hash` endpoint.
 *
 * Previously polled localhost relay for stale-build detection during dev.
 * With cloud-only relay (v3.0.0+), stale-build detection is deferred to
 * Figma Community's own plugin versioning. This hook is retained as a
 * no-op to preserve the existing API surface in `ui.tsx`.
 */

export interface UseBuildCheckReturn {
  /** Always false — no build-hash endpoint on the cloud relay. */
  buildStale: boolean;
}

export function useBuildCheck(_relayUrl: string, _enabled: boolean): UseBuildCheckReturn {
  return { buildStale: false };
}
