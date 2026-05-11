// ============================================================
// CallScreen.jsx — Full-screen active call UI
// Handles video/voice, mute, camera toggle, hang up
// ============================================================

import { useEffect, useRef } from "react";
import { CALL_STATE } from "../hooks/useCall";

export default function CallScreen({
  callState, callType, remoteUser, incomingCall,
  isMuted, isCameraOff, formattedDuration,
  localVideoRef, remoteVideoRef,
  onAnswer, onHangUp, onToggleMute, onToggleCamera,
}) {
  const isVideoCall = callType === "video";
  const isConnected = callState === CALL_STATE.CONNECTED;
  const isRinging   = callState === CALL_STATE.RINGING;
  const isIncoming  = callState === CALL_STATE.INCOMING;
  const isRequesting = callState === CALL_STATE.REQUESTING;

  // Ringtone
  const audioRef = useRef(null);
  useEffect(() => {
    if ((isRinging || isIncoming) && audioRef.current) {
      audioRef.current.play().catch(() => {});
    } else if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [isRinging, isIncoming]);

  const displayName = remoteUser?.name
    || incomingCall?.callerName
    || "Unknown";
  const avatarLetter = displayName[0]?.toUpperCase() ?? "?";

  return (
    <div className={`call-screen ${isVideoCall ? "video-call" : "voice-call"}`}>
      {/* Ringtone (loops) */}
      <audio ref={audioRef} loop preload="auto">
        <source src="/ringtone.mp3" type="audio/mpeg" />
      </audio>

      {/* ── Remote video (background) ────────────────────────── */}
      {isVideoCall && (
        <video
          ref={remoteVideoRef}
          className="remote-video"
          autoPlay
          playsInline
        />
      )}

      {/* ── Voice call / avatar background ───────────────────── */}
      {!isVideoCall && (
        <div className="voice-bg">
          <div className="avatar-ring" />
          <div className="avatar-large">
            {remoteUser?.photoURL
              ? <img src={remoteUser.photoURL} alt={displayName} />
              : <span>{avatarLetter}</span>
            }
          </div>
        </div>
      )}

      {/* ── Top info overlay ─────────────────────────────────── */}
      <div className="call-info">
        <p className="call-name">{displayName}</p>
        <p className="call-status">
          {isRequesting && "Connecting…"}
          {isRinging    && "Calling…"}
          {isIncoming   && `${callType === "video" ? "📹" : "📞"} Incoming ${callType} call`}
          {isConnected  && <span className="duration">{formattedDuration}</span>}
          {callState === CALL_STATE.ENDED && "Call ended"}
        </p>
      </div>

      {/* ── Local video (PiP) ────────────────────────────────── */}
      {isVideoCall && (
        <div className={`local-video-pip ${isCameraOff ? "camera-off" : ""}`}>
          {isCameraOff
            ? <div className="camera-off-badge">📷 Off</div>
            : <video ref={localVideoRef} className="local-video" autoPlay playsInline muted />
          }
        </div>
      )}

      {/* ── INCOMING CALL buttons ────────────────────────────── */}
      {isIncoming && (
        <div className="call-actions incoming">
          <button className="btn-decline" onClick={onHangUp} aria-label="Decline">
            <PhoneDown />
          </button>
          <div className="caller-pulse">
            <div className="avatar-md">
              {incomingCall?.callerPhotoURL
                ? <img src={incomingCall.callerPhotoURL} alt="" />
                : <span>{avatarLetter}</span>
              }
            </div>
          </div>
          <button className="btn-answer" onClick={onAnswer} aria-label="Answer">
            <PhoneUp />
          </button>
        </div>
      )}

      {/* ── ACTIVE CALL controls ─────────────────────────────── */}
      {(isConnected || isRinging || isRequesting) && (
        <div className="call-actions active">
          {/* Mute toggle */}
          <button
            className={`ctrl-btn ${isMuted ? "active" : ""}`}
            onClick={onToggleMute}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff /> : <Mic />}
            <span>{isMuted ? "Unmute" : "Mute"}</span>
          </button>

          {/* Camera toggle (video calls only) */}
          {isVideoCall && (
            <button
              className={`ctrl-btn ${isCameraOff ? "active" : ""}`}
              onClick={onToggleCamera}
              aria-label={isCameraOff ? "Camera on" : "Camera off"}
            >
              {isCameraOff ? <VideoOff /> : <Video />}
              <span>{isCameraOff ? "Start video" : "Stop video"}</span>
            </button>
          )}

          {/* Hang up */}
          <button className="btn-hangup" onClick={onHangUp} aria-label="Hang up">
            <PhoneDown />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Inline SVG icons (no external dependency) ─────────────────────────────

const Mic     = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93V20H9v2h6v-2h-2v-2.07A7 7 0 0 0 19 11h-2z"/></svg>;
const MicOff  = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V20H9v2h6v-2h-2v-2.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/></svg>;
const Video   = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>;
const VideoOff = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z"/></svg>;
const PhoneDown = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 15.5c-1.25 0-2.45-.2-3.57-.57-.35-.11-.74-.03-1.02.24l-2.2 2.2c-2.83-1.44-5.15-3.75-6.59-6.59l2.2-2.21c.27-.26.35-.65.24-1C8.7 6.45 8.5 5.25 8.5 4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.5c0-.55-.45-1-1-1z"/><path d="M18.28 5.72l-1.41 1.41L18.16 8.4 15.78 6 14.37 7.41l2.27 2.27-1.41 1.42 1.41 1.41 1.42-1.41 2.26 2.26L21.73 12l-2.27-2.27 1.41-1.41-1.59-2.6z"/></svg>;
const PhoneUp = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8c1.44 2.84 3.76 5.15 6.6 6.6l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.58.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.24 1.02L6.6 10.8z"/></svg>;
