import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCustomToken,
  signOut as firebaseSignOut,
} from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

const isProduction = process.env.NODE_ENV === "production";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || (isProduction ? "" : "dummy-firebase-api-key"),
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || (isProduction ? "" : "dummy-app.firebaseapp.com"),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || (isProduction ? "" : "dummy-project"),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || (isProduction ? "" : "dummy-project.appspot.com"),
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || (isProduction ? "" : "1234567890"),
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || (isProduction ? "" : "1:1234567890:web:1234567890abcdef"),
};

if (!firebaseConfig.apiKey) {
  const errMsg = "FATAL ERROR: Firebase configuration environment variables are not set! " +
                 "Please configure NEXT_PUBLIC_FIREBASE_API_KEY in your environment.";
  if (typeof window !== 'undefined') {
    console.error(errMsg);
  }
  throw new Error(errMsg);
}

if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY && typeof window !== 'undefined') {
  console.warn("Firebase API Key is missing! Using local sandbox dummy keys.");
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Enable offline persistence — data is cached in IndexedDB and syncs when online
export const db = (() => {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    // Firestore already initialized (e.g. HMR), get existing instance
    const { getFirestore } = require("firebase/firestore");
    return getFirestore(app);
  }
})();

export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
// googleProvider.setCustomParameters({ hd: undefined }); // domain hint handled server-side

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result;
}

export async function signInWithMyIotToken(customToken: string) {
  return signInWithCustomToken(auth, customToken);
}

export async function signOut() {
  await firebaseSignOut(auth);
}
