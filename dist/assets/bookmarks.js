// Only gift IDs live here. Firestore remains the source of gifts and reservations.
const KEY = 'wishlist-bookmarks-v1';
export function readBookmarks(storage) {
  try {
    const value = JSON.parse(storage.getItem(KEY) || '[]');
    return new Set(Array.isArray(value) ? value.filter(id => typeof id === 'string' && id.length > 0 && id.length <= 1500) : []);
  } catch { return new Set(); }
}
export function writeBookmarks(storage, ids) {
  try { storage.setItem(KEY, JSON.stringify([...ids])); return true; }
  catch { return false; }
}
export const bookmarkStorageKey = KEY;
