// Screen Wake Lock helpers. Fails silently where unsupported.

let wakeLock = null;

export async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    });
  } catch {
    /* user may have denied, or unsupported */
  }
}

export function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

/** Re-acquire the lock whenever the page becomes visible again. */
export function initWakeLockOnVisibility() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestWakeLock();
  });
}
