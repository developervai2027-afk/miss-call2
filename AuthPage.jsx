// ============================================================
// AuthPage.jsx — Login: Google + Phone OTP
// ============================================================

import { useState, useRef } from "react";
import {
  signInWithGoogle,
  sendOTP,
  verifyOTP,
  setupRecaptcha,
} from "../services/authService";

export default function AuthPage() {
  const [step, setStep] = useState("select");  // 'select' | 'phone' | 'otp'
  const [phone, setPhone] = useState("");
  const [otp, setOtp]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const recaptchaContainerRef = useRef(null);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError("");
    try {
      await signInWithGoogle();
    } catch (e) {
      setError("Google sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async () => {
    if (!phone.trim()) return;
    setLoading(true);
    setError("");
    try {
      const recaptcha = setupRecaptcha("recaptcha-container");
      await sendOTP(phone, recaptcha);
      setStep("otp");
    } catch (e) {
      setError(e.message || "Failed to send OTP. Check number & try again.");
      window.recaptchaVerifier?.clear?.();
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length < 6) return;
    setLoading(true);
    setError("");
    try {
      await verifyOTP(otp);
    } catch (e) {
      setError("Invalid OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="logo-icon">📞</span>
          <h1>MissCall</h1>
          <p>Crystal-clear calls, anywhere</p>
        </div>

        {step === "select" && (
          <div className="auth-methods">
            <button
              className="btn-google"
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              <GoogleIcon />
              Continue with Google
            </button>

            <div className="divider"><span>or</span></div>

            <button
              className="btn-phone"
              onClick={() => setStep("phone")}
              disabled={loading}
            >
              📱 Continue with Phone
            </button>
          </div>
        )}

        {step === "phone" && (
          <div className="auth-phone">
            <p className="field-label">Enter your phone number</p>
            <input
              type="tel"
              placeholder="+880 1XXX XXXXXX"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="input-field"
              autoFocus
            />
            <div id="recaptcha-container" ref={recaptchaContainerRef} />
            <button
              className="btn-primary"
              onClick={handleSendOTP}
              disabled={loading || phone.length < 8}
            >
              {loading ? "Sending…" : "Send OTP →"}
            </button>
            <button className="btn-back" onClick={() => setStep("select")}>← Back</button>
          </div>
        )}

        {step === "otp" && (
          <div className="auth-otp">
            <p className="field-label">Enter the 6-digit code sent to</p>
            <p className="phone-display">{phone}</p>
            <input
              type="number"
              placeholder="· · · · · ·"
              value={otp}
              onChange={e => setOtp(e.target.value.slice(0, 6))}
              className="input-field otp-input"
              autoFocus
              maxLength={6}
            />
            <button
              className="btn-primary"
              onClick={handleVerifyOTP}
              disabled={loading || otp.length < 6}
            >
              {loading ? "Verifying…" : "Verify & Sign In →"}
            </button>
            <button
              className="btn-back"
              onClick={() => { setStep("phone"); setOtp(""); }}
            >
              ← Change number
            </button>
          </div>
        )}

        {error && <p className="auth-error">⚠️ {error}</p>}
      </div>
    </div>
  );
}

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);
