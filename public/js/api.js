// Fetch wrappers and SSE subscription.

export async function fetchLibrary() {
  const res = await fetch('/api/library');
  if (!res.ok) throw new Error(`Failed to load library (${res.status})`);
  return res.json();
}

export async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    if (res.ok) return await res.json();
  } catch {
    /* ignore */
  }
  return { crossfadeMs: 1500 };
}

export async function rescan() {
  const res = await fetch('/api/rescan', { method: 'POST' });
  if (!res.ok) throw new Error('Rescan failed');
  return res.json();
}

export async function putItemSettings(id, patch) {
  const res = await fetch(`/api/items/${encodeURIComponent(id)}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('Settings update failed');
  return res.json();
}

export async function deleteItemSettings(id) {
  const res = await fetch(`/api/items/${encodeURIComponent(id)}/settings`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Settings delete failed');
  return res.json();
}

/**
 * Subscribe to server-sent library updates. The browser auto-reconnects using
 * the `retry:` directive we send. Returns the EventSource.
 * @param {(data:any)=>void} onChange
 */
export function subscribeEvents(onChange) {
  const es = new EventSource('/api/events');
  es.addEventListener('library-changed', (e) => {
    try {
      onChange(JSON.parse(e.data));
    } catch {
      /* ignore malformed */
    }
  });
  es.onerror = () => {
    // Reconnect is automatic; nothing to do here.
  };
  return es;
}
