import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore with custom databaseId if configured and ignoreUndefinedProperties
let db: ReturnType<typeof getFirestore>;
try {
  const dbId = (firebaseConfig as any).firestoreDatabaseId;
  db = dbId
    ? initializeFirestore(app, { ignoreUndefinedProperties: true }, dbId)
    : initializeFirestore(app, { ignoreUndefinedProperties: true });
} catch (err) {
  console.warn("Error initializing Firestore with custom settings, falling back to standard getFirestore:", err);
  const dbId = (firebaseConfig as any).firestoreDatabaseId;
  db = dbId ? getFirestore(app, dbId) : getFirestore(app);
}

export { app, db };
