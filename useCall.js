// ============================================================
// useCall.js — Custom hook for managing a WebRTC call session
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";
import { SignalingService } from "../services/signalingService";
import { getLocalStream, stopStream } from "../services/mediaService";

export const CALL_STATE = {
  IDLE:       "idle",
  REQUESTING: "requesting",   // getting permissions
  RINGING:    "ringing",      // outgoing — waiting for answer
  INCOMING:   "incoming",     // showing incoming call UI
  CONNECTED:  "connected",
  ENDED:      "ended",
  ERROR:      "error",
};

/**
 * useCall — manages the full lifecycle of a call
 *
 * @param {string} currentUserId
 * @returns call state, controls, and stream refs
 */
export const useCall = (currentUserId) => {
  const [callState,     setCallState]     = useState(CALL_STATE.IDLE);
  const [callType,      setCallType]      = useState(null);   // 'voice' | 'video'
  const [remoteUser,    setRemoteUser]    = useState(null);   // {uid, name, photoURL}
  const [incomingCall,  setIncomingCall]  = useState(null);
  const [isMuted,       setIsMuted]       = useState(false);
  const [isCameraOff,   setIsCameraOff]   = useState(false);
  const [callDuration,  setCallDuration]  = useState(0);
  const [error,         setError]         = useState(null);

  const signalingRef    = useRef(null);
  const localStreamRef  = useRef(null);
  const remoteStreamRef = useRef(null);
  const durationTimerRef = useRef(null);
  const localVideoRef   = useRef(null);   // <video> element ref
  const remoteVideoRef  = useRef(null);   // <video> element ref

  // -----------------------------------------------------------------------
  // Listen for incoming calls
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!currentUserId) return;

    const unsub = SignalingService.listenForIncomingCalls(currentUserId, (call) => {
      if (call.cancelled) {
        // Caller hung up before we answered
        if (incomingCall?.roomId === call.roomId) {
          setIncomingCall(null);
          setCallState(CALL_STATE.IDLE);
        }
        return;
      }

      if (callState === CALL_STATE.IDLE) {
        setIncomingCall(call);
        setCallState(CALL_STATE.INCOMING);
        setCallType(call.type);
      }
    });

    // Also listen for service worker forwarded call notifications
    const handleSWMessage = (event) => {
      if (event.data?.type === "INCOMING_CALL") {
        setIncomingCall(event.data);
        setCallState(CALL_STATE.INCOMING);
      }
    };
    navigator.serviceWorker?.addEventListener("message", handleSWMessage);

    return () => {
      unsub();
      navigator.serviceWorker?.removeEventListener("message", handleSWMessage);
    };
  }, [currentUserId, callState, incomingCall]);

  // -----------------------------------------------------------------------
  // Attach streams to <video> elements when refs change
  // -----------------------------------------------------------------------
  const attachStreams = useCallback(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
  }, []);

  // -----------------------------------------------------------------------
  // Start duration timer
  // -----------------------------------------------------------------------
  const startTimer = useCallback(() => {
    setCallDuration(0);
    durationTimerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  // -----------------------------------------------------------------------
  // Handler: call ended by remote peer or error
  // -----------------------------------------------------------------------
  const handleCallEnd = useCallback((reason) => {
    console.log("[useCall] Call ended:", reason);
    stopTimer();
    setCallState(CALL_STATE.ENDED);
    stopStream(localStreamRef.current);
    localStreamRef.current  = null;
    remoteStreamRef.current = null;

    // Auto-reset to IDLE after 3 s
    setTimeout(() => setCallState(CALL_STATE.IDLE), 3000);
  }, [stopTimer]);

  // -----------------------------------------------------------------------
  // INITIATE an outgoing call
  // -----------------------------------------------------------------------
  const startCall = useCallback(async (targetUser, type = "video") => {
    if (callState !== CALL_STATE.IDLE) return;

    setError(null);
    setCallState(CALL_STATE.REQUESTING);
    setCallType(type);
    setRemoteUser(targetUser);

    try {
      // 1. Get local media
      const localStream = await getLocalStream(type);
      localStreamRef.current = localStream;
      attachStreams();

      // 2. Create signaling service and initiate offer
      const svc = new SignalingService(
        localStream,
        (remoteStream) => {
          remoteStreamRef.current = remoteStream;
          attachStreams();
          setCallState(CALL_STATE.CONNECTED);
          startTimer();
        },
        handleCallEnd,
        currentUserId
      );
      signalingRef.current = svc;

      const roomId = await svc.createCall(targetUser.uid, type);
      console.log("[useCall] Room created:", roomId);

      setCallState(CALL_STATE.RINGING);
    } catch (err) {
      console.error("[useCall] startCall error:", err);
      setError(err.message);
      setCallState(CALL_STATE.ERROR);
      stopStream(localStreamRef.current);
    }
  }, [callState, currentUserId, attachStreams, startTimer, handleCallEnd]);

  // -----------------------------------------------------------------------
  // ANSWER an incoming call
  // -----------------------------------------------------------------------
  const answerCall = useCallback(async () => {
    if (!incomingCall) return;

    setError(null);
    setCallState(CALL_STATE.REQUESTING);
    setRemoteUser({ uid: incomingCall.callerId });

    try {
      const localStream = await getLocalStream(incomingCall.type);
      localStreamRef.current = localStream;
      attachStreams();

      const svc = new SignalingService(
        localStream,
        (remoteStream) => {
          remoteStreamRef.current = remoteStream;
          attachStreams();
          setCallState(CALL_STATE.CONNECTED);
          startTimer();
        },
        handleCallEnd,
        currentUserId
      );
      signalingRef.current = svc;

      await svc.answerCall(incomingCall.roomId, incomingCall.callerId);
      setIncomingCall(null);
    } catch (err) {
      console.error("[useCall] answerCall error:", err);
      setError(err.message);
      setCallState(CALL_STATE.ERROR);
      stopStream(localStreamRef.current);
    }
  }, [incomingCall, currentUserId, attachStreams, startTimer, handleCallEnd]);

  // -----------------------------------------------------------------------
  // DECLINE / HANG UP
  // -----------------------------------------------------------------------
  const hangUp = useCallback(async () => {
    stopTimer();
    if (signalingRef.current) {
      await signalingRef.current.hangUp();
      signalingRef.current = null;
    }
    stopStream(localStreamRef.current);
    localStreamRef.current  = null;
    remoteStreamRef.current = null;
    setIncomingCall(null);
    setCallState(CALL_STATE.IDLE);
    setCallDuration(0);
  }, [stopTimer]);

  // -----------------------------------------------------------------------
  // Toggle mute / camera
  // -----------------------------------------------------------------------
  const toggleMute = useCallback(() => {
    const newMuted = !isMuted;
    signalingRef.current?.toggleAudio(!newMuted);
    setIsMuted(newMuted);
  }, [isMuted]);

  const toggleCamera = useCallback(() => {
    const newOff = !isCameraOff;
    signalingRef.current?.toggleVideo(!newOff);
    setIsCameraOff(newOff);
  }, [isCameraOff]);

  // -----------------------------------------------------------------------
  // Format duration helper
  // -----------------------------------------------------------------------
  const formatDuration = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return {
    // State
    callState,
    callType,
    remoteUser,
    incomingCall,
    isMuted,
    isCameraOff,
    callDuration,
    formattedDuration: formatDuration(callDuration),
    error,

    // Refs for <video> elements
    localVideoRef,
    remoteVideoRef,

    // Actions
    startCall,
    answerCall,
    hangUp,
    toggleMute,
    toggleCamera,
  };
};
