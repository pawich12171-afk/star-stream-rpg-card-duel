import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Firestore is configured with a persistent local cache so writes are kept
// locally while offline and synchronized with Firestore automatically when
// the connection returns. onSnapshot listeners in the app keep all clients
// updated in real time.
let db: ReturnType<typeof getFirestore>;
try {
  const dbId = (firebaseConfig as any).firestoreDatabaseId;
  const settings = {
    ignoreUndefinedProperties: true,
    experimentalForceLongPolling: true,
    localCache: persistentLocalCache({
      tabManager: persistentSingleTabManager(),
    }),
  };

  db = dbId
    ? initializeFirestore(app, settings, dbId)
    : initializeFirestore(app, settings);
} catch (err) {
  console.warn(
    "Error initializing Firestore with persistent cache, falling back to standard getFirestore:",
    err,
  );
  const dbId = (firebaseConfig as any).firestoreDatabaseId;
  db = dbId ? getFirestore(app, dbId) : getFirestore(app);
}

export { app, db };
