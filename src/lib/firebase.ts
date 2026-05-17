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

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

if (!firebaseConfig.apiKey && typeof window !== 'undefined') {
  console.error("Firebase API Key is missing! Make sure to set NEXT_PUBLIC_FIREBASE_API_KEY in your deployment environment variables.");
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
