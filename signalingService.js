// ============================================================
// signalingService.js — WebRTC + Firestore Signaling Service
// ============================================================
//
// SIGNALING FLOW:
//   Caller  → createOffer()  → Firestore rooms/{roomId}/offer
//   Callee  → listenForOffer() → createAnswer() → rooms/{roomId}/answer
//   Both    → exchangeICECandidates() via subcollections
//   P2P media stream established
// ============================================================

import {
  collection, doc, setDoc, getDoc, onSnapshot,
  addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy
} from "firebase/firestore";
import { db } from "./firebase";

// ---------------------------------------------------------------------------
// ICE / STUN / TURN configuration
// Uses Google's free STUN servers + optional TURN fallback.
// For production, deploy your own Coturn instance and add credentials here.
// ---------------------------------------------------------------------------
const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    // TURN fallback — replace with your Coturn credentials
    // {
    //   urls: "turn:your-turn-server.com:3478",
    //   username: import.meta.env.VITE_TURN_USERNAME,
    //   credential: import.meta.env.VITE_TURN_CREDENTIAL,
    // },
  ],
  iceCandidatePoolSize: 10,
};

// ---------------------------------------------------------------------------
// Helper: generate a random room ID
// ---------------------------------------------------------------------------
export const generateRoomId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// ---------------------------------------------------------------------------
// SignalingService class
// Usage:
//   const svc = new SignalingService(localStream, onRemoteStream, onCallEnd);
//   const roomId = await svc.createCall(calleeId, 'video');
//   // or
//   await svc.answerCall(roomId, callerId);
// ---------------------------------------------------------------------------
export class SignalingService {
  /**
   * @param {MediaStream}           localStream     – caller's local A/V stream
   * @param {Function}              onRemoteStream  – cb(MediaStream) when remote track arrives
   * @param {Function}              onCallEnd       – cb(reason) when call is terminated
   * @param {string}                currentUserId
   */
  constructor(localStream, onRemoteStream, onCallEnd, currentUserId) {
    this.localStream     = localStream;
    this.onRemoteStream  = onRemoteStream;
    this.onCallEnd       = onCallEnd;
    this.currentUserId   = currentUserId;
    this.pc              = null;        // RTCPeerConnection
    this.roomId          = null;
    this._unsubscribers  = [];          // Firestore listeners to clean up
    this.remoteStream    = new MediaStream();
  }

  // -----------------------------------------------------------------------
  // Internal: create and configure RTCPeerConnection
  // -----------------------------------------------------------------------
  _createPeerConnection() {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Attach local tracks
    this.localStream.getTracks().forEach(track => {
      pc.addTrack(track, this.localStream);
    });

    // Receive remote tracks
    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach(track => {
        this.remoteStream.addTrack(track);
      });
      this.onRemoteStream(this.remoteStream);
    };

    // Connection state changes
    pc.onconnectionstatechange = () => {
      console.log("[WebRTC] Connection state:", pc.connectionState);
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        this.onCallEnd("connection_" + pc.connectionState);
      }
    };

    this.pc = pc;
    return pc;
  }

  // -----------------------------------------------------------------------
  // CALLER: Create offer, save to Firestore, start ICE exchange
  // -----------------------------------------------------------------------
  async createCall(calleeId, callType = "video") {
    const roomId  = generateRoomId();
    this.roomId   = roomId;
    const pc      = this._createPeerConnection();
    const roomRef = doc(db, "rooms", roomId);

    // ── ICE candidates: save caller's candidates to Firestore ──────────────
    pc.onicecandidate = async ({ candidate }) => {
      if (candidate) {
        await addDoc(
          collection(db, "rooms", roomId, "callerCandidates"),
          candidate.toJSON()
        );
      }
    };

    // ── Create & save offer ─────────────────────────────────────────────────
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await setDoc(roomRef, {
      offer:     { type: offer.type, sdp: offer.sdp },
      callerId:  this.currentUserId,
      calleeId,
      type:      callType,
      status:    "ringing",
      createdAt: serverTimestamp(),
    });

    // ── Log call in /calls collection ───────────────────────────────────────
    await this._logCall(roomId, calleeId, callType, "ringing");

    // ── Listen for answer ───────────────────────────────────────────────────
    const unsub1 = onSnapshot(roomRef, async (snapshot) => {
      const data = snapshot.data();
      if (data?.answer && !pc.currentRemoteDescription) {
        const answer = new RTCSessionDescription(data.answer);
        await pc.setRemoteDescription(answer);
      }
      if (data?.status === "ended") {
        this.onCallEnd("remote_hangup");
      }
    });
    this._unsubscribers.push(unsub1);

    // ── Listen for callee's ICE candidates ──────────────────────────────────
    const calleeCandidatesRef = collection(db, "rooms", roomId, "calleeCandidates");
    const unsub2 = onSnapshot(query(calleeCandidatesRef, orderBy("__name__")), (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
          const candidate = new RTCIceCandidate(change.doc.data());
          await pc.addIceCandidate(candidate).catch(console.warn);
        }
      });
    });
    this._unsubscribers.push(unsub2);

    return roomId;
  }

  // -----------------------------------------------------------------------
  // CALLEE: Receive offer, create answer, complete handshake
  // -----------------------------------------------------------------------
  async answerCall(roomId, callerId) {
    this.roomId   = roomId;
    const pc      = this._createPeerConnection();
    const roomRef = doc(db, "rooms", roomId);

    // ── ICE candidates: save callee's candidates ────────────────────────────
    pc.onicecandidate = async ({ candidate }) => {
      if (candidate) {
        await addDoc(
          collection(db, "rooms", roomId, "calleeCandidates"),
          candidate.toJSON()
        );
      }
    };

    // ── Fetch and apply the offer ────────────────────────────────────────────
    const roomSnapshot = await getDoc(roomRef);
    const roomData     = roomSnapshot.data();

    await pc.setRemoteDescription(new RTCSessionDescription(roomData.offer));

    // ── Create & save answer ─────────────────────────────────────────────────
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await updateDoc(roomRef, {
      answer: { type: answer.type, sdp: answer.sdp },
      status: "accepted",
    });

    // ── Update call log ──────────────────────────────────────────────────────
    await this._updateCallStatus(roomId, "accepted");

    // ── Listen for caller's ICE candidates ──────────────────────────────────
    const callerCandidatesRef = collection(db, "rooms", roomId, "callerCandidates");
    const unsub1 = onSnapshot(query(callerCandidatesRef, orderBy("__name__")), (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
          const candidate = new RTCIceCandidate(change.doc.data());
          await pc.addIceCandidate(candidate).catch(console.warn);
        }
      });
    });
    this._unsubscribers.push(unsub1);

    // ── Listen for call status changes ──────────────────────────────────────
    const unsub2 = onSnapshot(roomRef, (snapshot) => {
      const data = snapshot.data();
      if (data?.status === "ended") {
        this.onCallEnd("remote_hangup");
      }
    });
    this._unsubscribers.push(unsub2);
  }

  // -----------------------------------------------------------------------
  // Listen for incoming calls targeting this user
  // -----------------------------------------------------------------------
  static listenForIncomingCalls(userId, onIncomingCall) {
    const roomsRef = collection(db, "rooms");
    return onSnapshot(roomsRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const data = change.doc.data();
          if (data.calleeId === userId && data.status === "ringing") {
            onIncomingCall({ roomId: change.doc.id, ...data });
          }
        }
        if (change.type === "modified") {
          const data = change.doc.data();
          // Notify if call was cancelled before answer
          if (data.calleeId === userId && data.status === "ended") {
            onIncomingCall({ roomId: change.doc.id, ...data, cancelled: true });
          }
        }
      });
    });
  }

  // -----------------------------------------------------------------------
  // Toggle local audio / video tracks
  // -----------------------------------------------------------------------
  toggleAudio(enabled) {
    this.localStream.getAudioTracks().forEach(t => { t.enabled = enabled; });
  }

  toggleVideo(enabled) {
    this.localStream.getVideoTracks().forEach(t => { t.enabled = enabled; });
  }

  // -----------------------------------------------------------------------
  // Hang up: mark room as ended, close peer connection, release media
  // -----------------------------------------------------------------------
  async hangUp() {
    // Mark room as ended so the other peer reacts
    if (this.roomId) {
      try {
        await updateDoc(doc(db, "rooms", this.roomId), { status: "ended", endedAt: serverTimestamp() });
        await this._updateCallStatus(this.roomId, "ended");
      } catch (e) {
        console.warn("[SignalingService] hangUp Firestore update failed:", e);
      }
    }

    // Stop all local tracks
    this.localStream?.getTracks().forEach(t => t.stop());

    // Close RTCPeerConnection
    if (this.pc) {
      this.pc.ontrack            = null;
      this.pc.onicecandidate      = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
      this.pc = null;
    }

    // Detach all Firestore listeners
    this._unsubscribers.forEach(unsub => unsub());
    this._unsubscribers = [];
  }

  // -----------------------------------------------------------------------
  // Private helpers: Firestore call log
  // -----------------------------------------------------------------------
  async _logCall(roomId, calleeId, callType, status) {
    await setDoc(doc(db, "calls", roomId), {
      callId:    roomId,
      callerId:  this.currentUserId,
      calleeId,
      type:      callType,       // 'voice' | 'video'
      status,                    // 'ringing' | 'accepted' | 'ended' | 'missed'
      startedAt: serverTimestamp(),
      endedAt:   null,
      duration:  null,
    });
  }

  async _updateCallStatus(roomId, status) {
    const update = { status };
    if (status === "ended") {
      update.endedAt = serverTimestamp();
    }
    try {
      await updateDoc(doc(db, "calls", roomId), update);
    } catch (e) {
      console.warn("[SignalingService] _updateCallStatus failed:", e);
    }
  }
}

export default SignalingService;
