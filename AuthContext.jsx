// ============================================================
// AuthContext.jsx — Global authentication state
// ============================================================

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthChange } from "../services/authService";
import { initFCM, onForegroundMessage } from "../services/notificationService";
import { setUserOnline, setUserOffline } from "../services/userService";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(undefined); // undefined = loading
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubAuth = onAuthChange(async (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

      if (firebaseUser) {
        // Initialize FCM + set presence
        await initFCM().catch(console.warn);
        await setUserOnline(firebaseUser.uid).catch(console.warn);

        // Handle foreground push notifications
        const unsubMsg = await onForegroundMessage((payload) => {
          // Dispatch a custom event that the UI can listen to
          window.dispatchEvent(new CustomEvent("fcm:message", { detail: payload }));
        });
        return unsubMsg;
      } else {
        if (firebaseUser === null) {
          // Signed out
        }
      }
    });

    // On page unload, mark offline
    const handleUnload = () => {
      if (user?.uid) setUserOffline(user.uid);
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      unsubAuth();
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
