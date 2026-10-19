"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { getPublicEnvConfig, type PublicEnvCheckResult } from "@/lib/config/env";
import { getFirebaseClientServices } from "@/lib/firebase/client";
import { useWorkspaceStore } from "@/store/workspace-store";

interface AuthContextValue {
  envConfig: PublicEnvCheckResult;
  user: User | null;
  ownerId: string;
  ownerEmail: string;
  authLoading: boolean;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string) => Promise<void>;
  sendResetEmail: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const envConfig = useMemo(() => getPublicEnvConfig(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(
    envConfig.mode === "live" && envConfig.isValid
  );
  const setAuthIdentity = useWorkspaceStore((s) => s.setAuthIdentity);

  useEffect(() => {
    if (envConfig.mode === "demo") {
      setAuthIdentity("demo-local-architect", "demo@myeonjeok.local");
      setAuthLoading(false);
      return;
    }

    if (!envConfig.isValid) {
      setAuthLoading(false);
      return;
    }

    try {
      const { auth } = getFirebaseClientServices();
      const unsub = onAuthStateChanged(auth, (firebaseUser) => {
        setUser(firebaseUser);
        if (firebaseUser) {
          setAuthIdentity(
            firebaseUser.uid,
            firebaseUser.email || "architect@user.kr"
          );
        } else {
          setAuthIdentity("", "");
        }
        setAuthLoading(false);
      });
      return () => unsub();
    } catch {
      setAuthLoading(false);
    }
  }, [envConfig, setAuthIdentity]);

  const value: AuthContextValue = {
    envConfig,
    user,
    ownerId:
      envConfig.mode === "demo"
        ? "demo-local-architect"
        : user?.uid || "",
    ownerEmail:
      envConfig.mode === "demo"
        ? "demo@myeonjeok.local"
        : user?.email || "",
    authLoading,
    signInEmail: async (email, password) => {
      const { auth } = getFirebaseClientServices();
      await signInWithEmailAndPassword(auth, email, password);
    },
    signUpEmail: async (email, password) => {
      const { auth } = getFirebaseClientServices();
      await createUserWithEmailAndPassword(auth, email, password);
    },
    sendResetEmail: async (email) => {
      const { auth } = getFirebaseClientServices();
      await sendPasswordResetEmail(auth, email);
    },
    logout: async () => {
      const { auth } = getFirebaseClientServices();
      await signOut(auth);
    },
    getIdToken: async () => {
      if (envConfig.mode === "demo") return null;
      if (!user) return null;
      return await user.getIdToken();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAppAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAppAuth는 AuthProvider 내부에서 호출되어야 합니다.");
  }
  return ctx;
}
