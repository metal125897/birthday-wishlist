import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, setPersistence, signInAnonymously, onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {getFirestore} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import {firebaseConfig, firebaseConfigured} from './firebase-config.js';

// A separate app isolates the visitor's persistent identity from admin login/logout.
const app = firebaseConfigured ? initializeApp(firebaseConfig, 'wishlist-guests-v1') : null;
const guestAuth = app ? initializeAuth(app, {persistence: [browserLocalPersistence, indexedDBLocalPersistence]}) : null;
const db = app ? getFirestore(app) : null;
const guestReady = guestAuth ? guestAuth.authStateReady() : Promise.resolve();
let signingIn;

async function persistentSession() {
  await guestReady;
  if (!guestAuth) throw new Error('auth-unavailable');
  try { await setPersistence(guestAuth, browserLocalPersistence); }
  catch {
    try { await setPersistence(guestAuth, indexedDBLocalPersistence); }
    catch { throw new Error('persistent-storage-unavailable'); }
  }
  if (!guestAuth.currentUser) await signInAnonymously(guestAuth);
  return guestAuth.currentUser;
}

function ensureGuest() {
  if (!signingIn) {
    signingIn = (navigator.locks
      ? navigator.locks.request('wishlist-guest-sign-in', persistentSession)
      : persistentSession()).finally(() => { signingIn = null; });
  }
  return signingIn;
}

function watchGuest(callback) {
  return guestAuth ? onAuthStateChanged(guestAuth, callback) : () => {};
}

export {db, firebaseConfigured, guestReady, ensureGuest, watchGuest};
