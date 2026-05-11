// ============================================================
// authService.js — Firebase Authentication Service
// Supports: Phone (SMS OTP) + Google Sign-In
// ============================================================

import {
  signInWithPopup,
  GoogleAuthProvider,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

// ---------------------------------------------------------------------------
// Google Sign-In
// ---------------------------------------------------------------------------
export const signInWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  provider.addScope("profile");
  provider.addScope("email");

  try {
    const result = await signInWithPopup(auth, provider);
    await upsertUserProfile(result.user);
    return result.user;
  } catch (error) {
    console.error("[Auth] Google sign-in failed:", error);
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Phone Sign-In — Step 1: send OTP
// ---------------------------------------------------------------------------
export const setupRecaptcha = (containerId) => {
  // "invisible" reCAPTCHA – fires automatically on send
  window.recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
    size: "invisible",
    callback: () => {}, // reCAPTCHA solved
  });
  return window.recaptchaVerifier;
};

export const sendOTP = async (phoneNumber, recaptchaVerifier) => {
  try {
    const confirmationResult = await signInWithPhoneNumber(
      auth,
      phoneNumber,
      recaptchaVerifier
    );
    // Persist so verifyOTP can use it
    window.confirmationResult = confirmationResult;
    return confirmationResult;
  } catch (error) {
    console.error("[Auth] OTP send failed:", error);
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Phone Sign-In — Step 2: verify OTP
// ---------------------------------------------------------------------------
export const verifyOTP = async (otp) => {
  try {
    const result = await window.confirmationResult.confirm(otp);
    await upsertUserProfile(result.user);
    return result.user;
  } catch (error) {
    console.error("[Auth] OTP verification failed:", error);
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Sign Out
// ---------------------------------------------------------------------------
export const logOut = async () => {
  await updateDoc(doc(db, "users", auth.currentUser.uid), {
    status:   "offline",
    lastSeen: serverTimestamp(),
  }).catch(() => {});
  await signOut(auth);
};

// ---------------------------------------------------------------------------
// Update display name / photo
// ---------------------------------------------------------------------------
export const updateUserProfile = async (displayName, photoURL) => {
  await updateProfile(auth.currentUser, { displayName, photoURL });
  await updateDoc(doc(db, "users", auth.currentUser.uid), {
    name:     displayName,
    photoURL: photoURL ?? null,
  });
};

// ---------------------------------------------------------------------------
// Auth state observer — returns unsubscribe fn
// ---------------------------------------------------------------------------
export const onAuthChange = (callback) => onAuthStateChanged(auth, callback);

// ---------------------------------------------------------------------------
// Upsert user document in Firestore on every login
// Creates the doc on first login, updates lastSeen on subsequent logins.
// ---------------------------------------------------------------------------
export const upsertUserProfile = async (firebaseUser) => {
  const userRef  = doc(db, "users", firebaseUser.uid);
  const snapshot = await getDoc(userRef);

  const base = {
    uid:         firebaseUser.uid,
    name:        firebaseUser.displayName ?? "Unknown",
    photoURL:    firebaseUser.photoURL    ?? null,
    phoneNumber: firebaseUser.phoneNumber ?? null,
    email:       firebaseUser.email       ?? null,
    status:      "online",
    lastSeen:    serverTimestamp(),
    fcmToken:    null,   // populated separately by FCM service
    updatedAt:   serverTimestamp(),
  };

  if (!snapshot.exists()) {
    // First login — create full profile
    await setDoc(userRef, { ...base, createdAt: serverTimestamp() });
  } else {
    // Return user — just update presence
    await updateDoc(userRef, {
      status:   "online",
      lastSeen: serverTimestamp(),
    });
  }
};
