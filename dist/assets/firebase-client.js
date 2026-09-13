import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {getAuth} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {getFirestore} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import {firebaseConfig, firebaseConfigured} from './firebase-config.js';

let app = null;
let auth = null;
let db = null;

if (firebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

export {app, auth, db, firebaseConfigured};
