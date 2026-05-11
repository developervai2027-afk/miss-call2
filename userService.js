// ============================================================
// userService.js — User Profile + Contacts + Call History
// ============================================================

import {
  collection, doc, getDoc, getDocs, onSnapshot,
  query, where, orderBy, limit, updateDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

// ---------------------------------------------------------------------------
// Fetch a single user by UID
// ---------------------------------------------------------------------------
export const getUser = async (uid) => {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { uid: snap.id, ...snap.data() } : null;
};

// ---------------------------------------------------------------------------
// Search users by phone number (used when syncing phone contacts)
// ---------------------------------------------------------------------------
export const findUserByPhone = async (phoneNumber) => {
  const q = query(
    collection(db, "users"),
    where("phoneNumber", "==", phoneNumber),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const doc_ = snap.docs[0];
  return { uid: doc_.id, ...doc_.data() };
};

// ---------------------------------------------------------------------------
// Real-time contacts list — subscribes to changes
// Pass an array of UIDs (from phone book sync) to resolve their profiles.
// ---------------------------------------------------------------------------
export const subscribeToContacts = (uidList, callback) => {
  if (!uidList?.length) {
    callback([]);
    return () => {};
  }

  // Firestore "in" supports up to 30 items; chunk if needed
  const chunks = [];
  for (let i = 0; i < uidList.length; i += 30) {
    chunks.push(uidList.slice(i, i + 30));
  }

  const allUsers = {};
  const unsubscribers = chunks.map(chunk => {
    const q = query(collection(db, "users"), where("uid", "in", chunk));
    return onSnapshot(q, (snap) => {
      snap.docs.forEach(d => { allUsers[d.id] = { uid: d.id, ...d.data() }; });
      callback(Object.values(allUsers).sort((a, b) => a.name?.localeCompare(b.name)));
    });
  });

  return () => unsubscribers.forEach(u => u());
};

// ---------------------------------------------------------------------------
// Call history for current user (both as caller and callee)
// ---------------------------------------------------------------------------
export const subscribeToCallHistory = (userId, callback) => {
  // We need two queries merged (Firestore doesn't support OR across fields)
  const callerQ = query(
    collection(db, "calls"),
    where("callerId", "==", userId),
    orderBy("startedAt", "desc"),
    limit(50)
  );
  const calleeQ = query(
    collection(db, "calls"),
    where("calleeId", "==", userId),
    orderBy("startedAt", "desc"),
    limit(50)
  );

  const callMap = {};

  const merge = () => {
    const sorted = Object.values(callMap).sort(
      (a, b) => b.startedAt?.toMillis?.() - a.startedAt?.toMillis?.()
    );
    callback(sorted);
  };

  const unsub1 = onSnapshot(callerQ, (snap) => {
    snap.docs.forEach(d => { callMap[d.id] = { id: d.id, ...d.data() }; });
    merge();
  });

  const unsub2 = onSnapshot(calleeQ, (snap) => {
    snap.docs.forEach(d => { callMap[d.id] = { id: d.id, ...d.data() }; });
    merge();
  });

  return () => { unsub1(); unsub2(); };
};

// ---------------------------------------------------------------------------
// Update user presence
// ---------------------------------------------------------------------------
export const setUserOnline = async (uid) => {
  await updateDoc(doc(db, "users", uid), {
    status:   "online",
    lastSeen: serverTimestamp(),
  });
};

export const setUserOffline = async (uid) => {
  await updateDoc(doc(db, "users", uid), {
    status:   "offline",
    lastSeen: serverTimestamp(),
  });
};

// ---------------------------------------------------------------------------
// Update user status message
// ---------------------------------------------------------------------------
export const updateStatus = async (uid, statusText) => {
  await updateDoc(doc(db, "users", uid), { statusMessage: statusText });
};
