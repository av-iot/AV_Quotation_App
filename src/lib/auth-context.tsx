"use client";

import React, {
  createContext,
  useContext,
  useEffect,
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
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        setFirebaseUser(fbUser);
        setUser({
          uid: fbUser.uid,
          email: fbUser.email!,
          displayName: fbUser.displayName || null,
          photoURL: fbUser.photoURL || null,
          source: "google",
          role: "engineer",
        });
        // Fire and forget — never block loading on this
        fbUser.getIdToken().then((idToken) => {
          fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
          }).catch(() => {});
        });
      } else {
        setFirebaseUser(null);
        setUser(null);
        fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
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