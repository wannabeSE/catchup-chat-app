const STORAGE_KEY = "catchup-gameworld-active-tab";

/**
 * One active GameWorld per browser profile: the latest tab wins. Other tabs
 * receive a cross-tab `storage` event and should run `onSuperseded`.
 */
export function claimSingleGameTab(onSuperseded: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const tabId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;

  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || e.storageArea !== localStorage) return;
    const next = e.newValue;
    if (next != null && next !== tabId) onSuperseded();
  };

  window.addEventListener("storage", onStorage);
  localStorage.setItem(STORAGE_KEY, tabId);

  return () => {
    window.removeEventListener("storage", onStorage);
    if (localStorage.getItem(STORAGE_KEY) === tabId) {
      localStorage.removeItem(STORAGE_KEY);
    }
  };
}
