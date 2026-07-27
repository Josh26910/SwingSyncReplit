import { useCloudSync } from "@/hooks/useCloudSync";

/** No UI — just runs the background cloud-sync loop while signed in. */
export function CloudSyncManager() {
  useCloudSync();
  return null;
}
