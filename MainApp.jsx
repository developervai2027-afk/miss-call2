// ============================================================
// MainApp.jsx — Authenticated app: Contacts, Call History, Active Call
// ============================================================

import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useCall, CALL_STATE } from "../hooks/useCall";
import CallScreen from "../components/CallScreen";
import { subscribeToContacts, subscribeToCallHistory } from "../services/userService";
import { logOut } from "../services/authService";

const TAB = { CONTACTS: "contacts", RECENTS: "recents", PROFILE: "profile" };

export default function MainApp() {
  const { user }        = useAuth();
  const [tab, setTab]   = useState(TAB.CONTACTS);
  const [contacts, setContacts]   = useState([]);
  const [callHistory, setCallHistory] = useState([]);
  const [contactUIDs] = useState([]); // In production: parse phone book + find by phone

  const {
    callState, callType, remoteUser, incomingCall,
    isMuted, isCameraOff, formattedDuration,
    localVideoRef, remoteVideoRef,
    startCall, answerCall, hangUp, toggleMute, toggleCamera,
  } = useCall(user?.uid);

  // ── Subscribe to contacts & call history ─────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    const unsub1 = subscribeToContacts(contactUIDs, setContacts);
    const unsub2 = subscribeToCallHistory(user.uid, setCallHistory);
    return () => { unsub1(); unsub2(); };
  }, [user?.uid]);

  const isCallActive = callState !== CALL_STATE.IDLE && callState !== CALL_STATE.ENDED;

  // ── Call screen overlaid on top when active ───────────────────────────────
  if (isCallActive || callState === CALL_STATE.INCOMING) {
    return (
      <CallScreen
        callState={callState}
        callType={callType}
        remoteUser={remoteUser}
        incomingCall={incomingCall}
        isMuted={isMuted}
        isCameraOff={isCameraOff}
        formattedDuration={formattedDuration}
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
        onAnswer={answerCall}
        onHangUp={hangUp}
        onToggleMute={toggleMute}
        onToggleCamera={toggleCamera}
      />
    );
  }

  return (
    <div className="main-app">
      {/* ── Header ────────────────────────────────────────────── */}
      <header className="app-header">
        <span className="header-logo">📞 MissCall</span>
        <button className="btn-icon" onClick={logOut} title="Sign out">⎋</button>
      </header>

      {/* ── Tab navigation ───────────────────────────────────── */}
      <nav className="tab-nav">
        {Object.values(TAB).map(t => (
          <button
            key={t}
            className={`tab-btn ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === TAB.CONTACTS ? "👥 Contacts"
              : t === TAB.RECENTS ? "🕐 Recent"
              : "👤 Profile"}
          </button>
        ))}
      </nav>

      {/* ── Main content ─────────────────────────────────────── */}
      <main className="tab-content">
        {tab === TAB.CONTACTS && (
          <ContactsTab
            contacts={contacts}
            onVoiceCall={c => startCall(c, "voice")}
            onVideoCall={c => startCall(c, "video")}
          />
        )}
        {tab === TAB.RECENTS && (
          <RecentsTab history={callHistory} currentUserId={user?.uid} />
        )}
        {tab === TAB.PROFILE && (
          <ProfileTab user={user} />
        )}
      </main>
    </div>
  );
}

// ── Contacts Tab ─────────────────────────────────────────────────────────────

function ContactsTab({ contacts, onVoiceCall, onVideoCall }) {
  const [search, setSearch] = useState("");
  const filtered = contacts.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phoneNumber?.includes(search)
  );

  return (
    <div className="contacts-tab">
      <input
        className="search-input"
        placeholder="🔍 Search contacts…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      {filtered.length === 0 && (
        <div className="empty-state">
          <p>No contacts yet.</p>
          <p className="empty-sub">Contacts who use MissCall will appear here.</p>
        </div>
      )}
      <ul className="contact-list">
        {filtered.map(contact => (
          <ContactItem
            key={contact.uid}
            contact={contact}
            onVoiceCall={() => onVoiceCall(contact)}
            onVideoCall={() => onVideoCall(contact)}
          />
        ))}
      </ul>
    </div>
  );
}

function ContactItem({ contact, onVoiceCall, onVideoCall }) {
  const initial = contact.name?.[0]?.toUpperCase() ?? "?";
  return (
    <li className="contact-item">
      <div className="contact-avatar">
        {contact.photoURL
          ? <img src={contact.photoURL} alt={contact.name} />
          : <span>{initial}</span>
        }
        <span className={`presence-dot ${contact.status === "online" ? "online" : ""}`} />
      </div>
      <div className="contact-info">
        <p className="contact-name">{contact.name}</p>
        <p className="contact-sub">
          {contact.status === "online" ? "Online" : contact.statusMessage ?? contact.phoneNumber ?? ""}
        </p>
      </div>
      <div className="contact-actions">
        <button className="call-btn voice" onClick={onVoiceCall} title="Voice call">📞</button>
        <button className="call-btn video" onClick={onVideoCall} title="Video call">📹</button>
      </div>
    </li>
  );
}

// ── Recents Tab ──────────────────────────────────────────────────────────────

function RecentsTab({ history, currentUserId }) {
  if (history.length === 0) {
    return (
      <div className="empty-state">
        <p>No recent calls.</p>
      </div>
    );
  }

  return (
    <ul className="recents-list">
      {history.map(call => {
        const isOutgoing = call.callerId === currentUserId;
        const statusIcon = call.status === "ended"
          ? (isOutgoing ? "↗" : "↙")
          : (call.status === "missed" ? "⚠" : "…");
        const time = call.startedAt?.toDate?.()?.toLocaleString() ?? "";

        return (
          <li key={call.id} className={`recent-item ${call.status}`}>
            <span className="recent-icon">
              {call.type === "video" ? "📹" : "📞"}
            </span>
            <div className="recent-info">
              <p className="recent-peer">
                {isOutgoing ? `→ ${call.calleeId}` : `← ${call.callerId}`}
              </p>
              <p className="recent-meta">{statusIcon} {call.status} · {time}</p>
            </div>
            <span className={`recent-type ${call.type}`}>
              {call.type}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ── Profile Tab ──────────────────────────────────────────────────────────────

function ProfileTab({ user }) {
  return (
    <div className="profile-tab">
      <div className="profile-avatar">
        {user?.photoURL
          ? <img src={user.photoURL} alt={user.displayName} />
          : <span>{user?.displayName?.[0]?.toUpperCase() ?? "?"}</span>
        }
      </div>
      <p className="profile-name">{user?.displayName ?? "Anonymous"}</p>
      <p className="profile-sub">{user?.email ?? user?.phoneNumber ?? user?.uid}</p>
      <button className="btn-signout" onClick={logOut}>Sign Out</button>
    </div>
  );
}
