"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, signInWithGoogle, signOut } from "@/lib/firebase";
import type { AppUser } from "@/types";

interface AuthContextValue {
  user: AppUser | null;
  firebaseUser: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithMyIot: (jwt: string) => Promise<void>;
  signInDev: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const isDevLogin = useRef(
    typeof window !== "undefined" && localStorage.getItem("__dev_login") === "true"
  );

  useEffect(() => {
    // Restore dev user on mount (survives full page reload)
    if (isDevLogin.current && process.env.NODE_ENV === "development") {
      setUser({
        uid: "dev_user",
        email: "dev@altavision.lk",
        displayName: "Dev User",
        photoURL: null,
        source: "google",
        role: "engineer",
      });
      setLoading(false);
      return; // Skip Firebase auth listener entirely in dev mode
    }

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setFirebaseUser(fbUser);
        
        // Wait for session to be set before setting user state to prevent premature redirects
        try {
          const idToken = await fbUser.getIdToken();
          const res = await fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
          });
          
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            console.error("Failed to create session on server:", data.error || res.statusText);
            await signOut();
            setFirebaseUser(null);
            setUser(null);
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error("Error setting session:", err);
          await signOut();
          setFirebaseUser(null);
          setUser(null);
          setLoading(false);
          return;
        }

        setUser({
          uid: fbUser.uid,
          email: fbUser.email!,
          displayName: fbUser.displayName || null,
          photoURL: fbUser.photoURL || null,
          source: "google",
          role: "engineer",
        });
      } else {
        setFirebaseUser(null);
        setUser(null);
        try {
          await fetch("/api/auth/session", { method: "DELETE" });
        } catch (err) {}
      }
      // Always runs — loading will never get stuck
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleSignInWithGoogle = async () => {
    await signInWithGoogle();
    // onAuthStateChanged handles state update after popup closes
  };

  const handleSignInDev = async () => {
    if (process.env.NODE_ENV !== "development") return;
    isDevLogin.current = true;
    localStorage.setItem("__dev_login", "true");
    try {
      const res = await fetch("/api/auth/dev-login", { method: "POST" });
      if (!res.ok) throw new Error("Dev login failed");
      setUser({
        uid: "dev_user",
        email: "dev@altavision.lk",
        displayName: "Dev User",
        photoURL: null,
        source: "google",
        role: "engineer",
      });
      setLoading(false);
    } catch (err) {
      console.error("Dev login error:", err);
    }
  };

  const handleSignInWithMyIot = async (jwt: string) => {
    const res = await fetch("/api/auth/myiot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: jwt }),
    });
    const { customToken, error } = await res.json();
    if (error) throw new Error(error);
    const { signInWithMyIotToken } = await import("@/lib/firebase");
    await signInWithMyIotToken(customToken);
  };

  const handleSignOut = async () => {
    isDevLogin.current = false;
    localStorage.removeItem("__dev_login");
    try { await signOut(); } catch {}
    fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
    setUser(null);
    setFirebaseUser(null);
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        loading,
        signInWithGoogle: handleSignInWithGoogle,
        signInWithMyIot: handleSignInWithMyIot,
        signInDev: handleSignInDev,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}