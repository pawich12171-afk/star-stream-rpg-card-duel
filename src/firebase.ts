import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Use Firestore's persistent IndexedDB cache so writes survive page/app close.
// This is important for Status updates: if the user closes the app immediately
// after changing HP, Stats, Buffs/Nerfs, Skills, etc., Firestore can keep the
// pending write locally and send it when the app is opened again.
// Multiple tabs are supported so the persistent cache remains safe across tabs.
let db: ReturnType<typeof getFirestore>;
try {
  const dbId = (firebaseConfig as any).firestoreDatabaseId;
  const settings = {
    ignoreUndefinedProperties: true,
    experimentalForceLongPolling: true,
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
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
