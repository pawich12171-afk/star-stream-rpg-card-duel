import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// IMPORTANT:
// Use an in-memory Firestore cache instead of persistent browser storage.
// The old persistent cache could replay an older Firestore snapshot when the
// page was opened, then the server snapshot arrived afterwards. That made the
// UI appear to switch between OLD and NEW character/shop data until a refresh.
// The server is now the source of truth after every page load.
let db: ReturnType<typeof getFirestore>;
try {
  const dbId = (firebaseConfig as any).firestoreDatabaseId;
  const settings = {
    ignoreUndefinedProperties: true,
    experimentalForceLongPolling: true,
    localCache: memoryLocalCache(),
  };

  db = dbId
    ? initializeFirestore(app, settings, dbId)
    : initializeFirestore(app, settings);
} catch (err) {
  console.warn(
    "Error initializing Firestore with memory cache, falling back to standard getFirestore:",
    err,
  );
  const dbId = (firebaseConfig as any).firestoreDatabaseId;
  db = dbId ? getFirestore(app, dbId) : getFirestore(app);
}

export { app, db };