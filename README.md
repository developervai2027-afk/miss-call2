# 📞 MissCall — WebRTC Calling App

A production-ready, WhatsApp-style voice & video calling web app built with **React + Firebase + WebRTC**.

## Tech Stack

| Layer         | Technology                              |
|---------------|-----------------------------------------|
| Frontend      | React 18 + Vite                         |
| Auth          | Firebase Auth (Phone OTP + Google)      |
| Signaling     | Cloud Firestore (offer/answer/ICE)      |
| Media         | WebRTC (getUserMedia + RTCPeerConnection)|
| Notifications | Firebase Cloud Messaging (FCM)          |
| Storage       | Cloud Firestore + Firebase Storage      |
| Hosting       | Firebase Hosting                        |

---

## Project Structure

```
miss-call-app/
├── src/
│   ├── services/
│   │   ├── firebase.js           # Firebase init (modular SDK v10)
│   │   ├── signalingService.js   # WebRTC + Firestore signaling ⭐
│   │   ├── authService.js        # Phone OTP + Google sign-in
│   │   ├── mediaService.js       # Camera/mic permissions + streams
│   │   ├── notificationService.js# FCM push notifications
│   │   └── userService.js        # Contacts + call history
│   ├── contexts/
│   │   └── AuthContext.jsx       # Global auth state
│   ├── hooks/
│   │   └── useCall.js            # Call lifecycle state machine ⭐
│   ├── components/
│   │   └── CallScreen.jsx        # Full-screen call UI ⭐
│   ├── pages/
│   │   ├── AuthPage.jsx          # Login (Phone/Google)
│   │   └── MainApp.jsx           # Main shell (contacts/recents/profile)
│   ├── styles.css
│   ├── App.jsx
│   └── main.jsx
├── public/
│   └── firebase-messaging-sw.js  # Background FCM service worker
├── firestore.rules               # Security rules
├── firestore.indexes.json        # Composite indexes
├── .env.example                  # Environment variable template
├── vite.config.js
└── package.json
```

---

## Quick Start

### 1. Firebase Console Setup

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Select project **miss-call-a8b06**
3. Enable **Authentication** → Phone + Google providers
4. Enable **Firestore Database** (production mode)
5. Enable **Cloud Messaging**
6. Enable **Storage** (for profile photos)

### 2. Install & Configure

```bash
git clone <your-repo>
cd miss-call-app
npm install

# Copy env template and fill in your Firebase config
cp .env.example .env.local
# Edit .env.local with values from Firebase Console → Project Settings
```

### 3. Deploy Firestore Rules & Indexes

```bash
npm install -g firebase-tools
firebase login
firebase use miss-call-a8b06

firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### 4. Run Locally

```bash
npm run dev
# Opens at http://localhost:5173
```

> **Note**: WebRTC `getUserMedia` requires HTTPS or `localhost`.  
> For testing on a device, run `vite --host` and use your LAN IP with a self-signed cert.

### 5. Deploy to Firebase Hosting

```bash
npm run build
firebase deploy --only hosting
```

---

## WebRTC Signaling Flow

```
CALLER                              FIRESTORE                     CALLEE
  │                                     │                            │
  │──createOffer()──────────────────────│                            │
  │──setLocalDescription(offer)         │                            │
  │──write rooms/{roomId}/offer────────►│                            │
  │                                     │◄───listenForOffers()───────│
  │                                     │                            │──setRemoteDescription(offer)
  │                                     │                            │──createAnswer()
  │                                     │                            │──setLocalDescription(answer)
  │                                     │◄──write rooms/{roomId}/answer─│
  │◄──listenForAnswer()─────────────────│                            │
  │──setRemoteDescription(answer)       │                            │
  │                                     │                            │
  │──ICE candidates─────────────────────►─────────────────────────►│
  │◄────────────────────────────────────◄──ICE candidates───────────│
  │                                     │                            │
  │◄══════════════════P2P MEDIA STREAM══════════════════════════════│
```

---

## Firestore Schema

### `users/{userId}`
```json
{
  "uid": "abc123",
  "name": "Rahim Ahmed",
  "photoURL": "https://...",
  "phoneNumber": "+8801712345678",
  "status": "online",
  "statusMessage": "Available",
  "fcmToken": "fcm-token-here",
  "lastSeen": "Timestamp",
  "createdAt": "Timestamp"
}
```

### `calls/{callId}`
```json
{
  "callerId": "uid-alice",
  "calleeId": "uid-bob",
  "type": "video",
  "status": "ended",
  "startedAt": "Timestamp",
  "endedAt": "Timestamp"
}
```

### `rooms/{roomId}`
```json
{
  "callerId": "uid-alice",
  "calleeId": "uid-bob",
  "offer": { "type": "offer", "sdp": "..." },
  "answer": { "type": "answer", "sdp": "..." },
  "status": "accepted"
}
```

---

## FCM Push Notification Setup

1. **Firebase Console** → Project Settings → Cloud Messaging
2. Generate a **Web Push certificate** (VAPID key)
3. Add the key to `.env.local` as `VITE_FIREBASE_VAPID_KEY`
4. Copy `public/firebase-messaging-sw.js` to your `/public` folder
5. The service worker uses `/__/firebase/init.js` (auto-injected by Firebase Hosting)

To send push notifications when a call is initiated, deploy a **Cloud Function**:

```javascript
// functions/index.js (sketch)
exports.onCallCreated = onDocumentCreated("rooms/{roomId}", async (event) => {
  const callData = event.data.data();
  const calleeDoc = await getFirestore().doc(`users/${callData.calleeId}`).get();
  const fcmToken = calleeDoc.data()?.fcmToken;
  if (!fcmToken) return;

  await getMessaging().send({
    token: fcmToken,
    notification: { title: "Incoming Call", body: `${callData.type} call` },
    data: { roomId: event.params.roomId, callType: callData.type },
  });
});
```

---

## Security Notes

- ✅ Firebase config values are **public** — safe to expose (they identify the project, they don't grant access)
- ✅ Access controlled by **Firestore Security Rules** (`firestore.rules`)
- ✅ Only call participants can read/write their room + call documents
- ✅ FCM tokens stored per-user and used server-side only
- ⚠️  For production: deploy a **Coturn TURN server** for clients behind strict NAT
- ⚠️  Add **App Check** (Firebase) to prevent API abuse

---

## GitHub Repo Structure (Recommended)

```
/
├── .github/workflows/
│   └── deploy.yml          # CI: build + firebase deploy on main push
├── functions/              # Cloud Functions (Node.js)
│   ├── index.js
│   └── package.json
├── miss-call-app/          # This web app (React + Vite)
├── .firebaserc
├── firebase.json
└── README.md
```

### `deploy.yml` (GitHub Actions)
```yaml
name: Deploy to Firebase Hosting
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci && npm run build
        working-directory: miss-call-app
        env:
          VITE_FIREBASE_API_KEY:            ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN:        ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID:         ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_STORAGE_BUCKET:     ${{ secrets.VITE_FIREBASE_STORAGE_BUCKET }}
          VITE_FIREBASE_MESSAGING_SENDER_ID:${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID:             ${{ secrets.VITE_FIREBASE_APP_ID }}
          VITE_FIREBASE_VAPID_KEY:          ${{ secrets.VITE_FIREBASE_VAPID_KEY }}
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          projectId: miss-call-a8b06
          entryPoint: miss-call-app
```
