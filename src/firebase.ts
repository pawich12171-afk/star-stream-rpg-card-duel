import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Keep Firestore server-authoritative across devices.
// Do not persist an IndexedDB cache here: a device-local persistent cache can
// make different devices appear to have different data until a server snapshot
// arrives. Pending writes are still handled by Firestore while the page is open.
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
    "Error initializing Firestore with persistent cache, falling back to standard getFirestore:",
    err,
  );
  const dbId = (firebaseConfig as any).firestoreDatabaseId;
  db = dbId ? getFirestore(app, dbId) : getFirestore(app);
}

export { app, db };
