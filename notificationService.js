// ============================================================
// notificationService.js — Firebase Cloud Messaging (FCM)
// Handles foreground + background push notifications for calls
// ============================================================

import { getToken, onMessage } from "firebase/messaging";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db, getMessagingInstance } from "./firebase";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

// ---------------------------------------------------------------------------
// Request notification permission and get FCM token
// ---------------------------------------------------------------------------
export const initFCM = async () => {
  const messaging = await getMessagingInstance();
  if (!messaging) {
    console.warn("[FCM] Not supported in this browser");
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("[FCM] Notification permission denied");
      return null;
    }

    const token = await getToken(messaging, { vapidKey: VAPID_KEY });

    if (token && auth.currentUser) {
      // Persist token to user's Firestore doc so server can target this device
      await updateDoc(doc(db, "users", auth.currentUser.uid), { fcmToken: token });
      console.log("[FCM] Token registered:", token.slice(0, 20) + "...");
    }

    return token;
  } catch (error) {
    console.error("[FCM] Init failed:", error);
    return null;
  }
};

// ---------------------------------------------------------------------------
// Foreground message handler — show in-app notification
// Returns unsubscribe function
// ---------------------------------------------------------------------------
export const onForegroundMessage = async (callback) => {
  const messaging = await getMessagingInstance();
  if (!messaging) return () => {};

  return onMessage(messaging, (payload) => {
    console.log("[FCM] Foreground message:", payload);
    callback(payload);
  });
};

// ============================================================
// public/firebase-messaging-sw.js  (Service Worker — copy to /public)
// ============================================================
// Background messages are handled by the service worker below.
// This is provided as a string template so you can write it to /public.
export const SERVICE_WORKER_CONTENT = `
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            self.__FIREBASE_API_KEY__,
  authDomain:        self.__FIREBASE_AUTH_DOMAIN__,
  projectId:         self.__FIREBASE_PROJECT_ID__,
  storageBucket:     self.__FIREBASE_STORAGE_BUCKET__,
  messagingSenderId: self.__FIREBASE_MESSAGING_SENDER_ID__,
  appId:             self.__FIREBASE_APP_ID__,
});

const messaging = firebase.messaging();

// Background push → show system notification
messaging.onBackgroundMessage((payload) => {
  const { title, body, data } = payload.notification ?? {};
  self.registration.showNotification(title ?? 'Incoming Call', {
    body:    body ?? 'Tap to answer',
    icon:    '/icon-192.png',
    badge:   '/badge-72.png',
    tag:     'incoming-call',
    renotify: true,
    data:    payload.data,
    actions: [
      { action: 'answer',  title: '✅ Answer' },
      { action: 'decline', title: '❌ Decline' },
    ],
  });
});

// Handle notification action clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const callData = event.notification.data;

  if (event.action === 'decline') {
    // Optionally POST to a Cloud Function to mark call as declined
    return;
  }

  // Focus or open the app
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'INCOMING_CALL', ...callData });
          return client.focus();
        }
      }
      return clients.openWindow(\`/?incomingCall=\${callData?.roomId}\`);
    })
  );
});
`;
