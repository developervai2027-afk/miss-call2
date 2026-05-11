// ============================================================
// firebase.js — Firebase Initialization (Modular SDK v10+)
// Project: miss-call-a8b06
// ============================================================

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getMessaging, isSupported } from "firebase/messaging";
import { getStorage } from "firebase/storage";

// ---------------------------------------------------------------------------
// ⚠️  SECURITY: Never commit real keys to Git.
//     In production, inject via CI/CD secrets or a secrets manager.
//     For local dev, create a .env file at project root (see .env.example).
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey:             import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:         import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:          import.meta.env.VITE_FIREBASE_PROJECT_ID,       // "miss-call-a8b06"
  storageBucket:      import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:  import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:              import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:      import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Initialize the Firebase app (singleton pattern — safe to import anywhere)
const app = initializeApp(firebaseConfig);

// Core services
export const auth      = getAuth(app);
export const db        = getFirestore(app);
export const storage   = getStorage(app);

// FCM is only supported in modern browsers; degrade gracefully elsewhere
export const getMessagingInstance = async () => {
  const supported = await isSupported();
  if (!supported) return null;
  return getMessaging(app);
};

export default app;
