import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

let adminApp: App;

function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0];

  adminApp = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
    privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
  }),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
});

// Tell Firestore to ignore undefined fields globally
getFirestore(adminApp).settings({ ignoreUndefinedProperties: true });

  return adminApp;
}

export const adminAuth = () => getAuth(getAdminApp());
export const adminDb = () => getFirestore(getAdminApp());
export const adminStorage = () => getStorage(getAdminApp());

// ─── Verify Firebase ID token from request ────────────────────────────────────
export async function verifyIdToken(token: string) {
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    return decoded;
  } catch {
    return null;
  }
}

// ─── Exchange myiot JWT for Firebase custom token ─────────────────────────────
export async function createCustomTokenFromMyIot(
  myiotJwt: string
): Promise<string | null> {
  try {
    const { jwtVerify } = await import("jose");
    const secret = new TextEncoder().encode(process.env.MYIOT_JWT_SECRET!);
    const { payload } = await jwtVerify(myiotJwt, secret);

    const uid = `myiot_${payload.sub}`;
    const email = payload.email as string;

    // Store/update user profile in Firestore
    await adminDb()
      .collection("users")
      .doc(uid)
      .set(
        {
          uid,
          email,
          displayName: payload.name || email,
          source: "myiot",
          role: (payload.role as string) || "engineer",
          lastSeen: new Date().toISOString(),
        },
        { merge: true }
      );

    const customToken = await adminAuth().createCustomToken(uid, {
      email,
      source: "myiot",
      role: payload.role || "engineer",
    });

    return customToken;
  } catch (err) {
    console.error("myiot JWT exchange failed:", err);
    return null;
  }
}
