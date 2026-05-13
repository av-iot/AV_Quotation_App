import { beforeUserCreated, beforeUserSignedIn } from "firebase-functions/v2/identity";
import { HttpsError } from "firebase-functions/v2/https";

// ─── Allowed email domains ────────────────────────────────────────────────────
const ALLOWED_DOMAINS = [
  "altavision.lk",      // your company domain
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
];

// Specific emails that are always allowed regardless of domain
const ALLOWED_EMAILS: string[] = [
  // "partner@externaldomain.com",
];

function isAllowed(email: string | undefined): boolean {
  if (!email) return false;
  if (ALLOWED_EMAILS.includes(email.toLowerCase())) return true;
  const domain = email.split("@")[1]?.toLowerCase();
  return ALLOWED_DOMAINS.includes(domain);
}

// Runs before a new user account is created
export const beforecreated = beforeUserCreated((event) => {
  const email = event.data?.email;
  if (!isAllowed(email)) {
    throw new HttpsError(
      "permission-denied",
      `Access denied. ${email} is not authorized to use this system.`
    );
  }
});

// Runs before every sign-in (catches existing users if domain rule changes)
export const beforesignedin = beforeUserSignedIn((event) => {
  const email = event.data?.email;

  // myiot users (uid starts with "myiot_") always allowed
  if (event.data?.uid?.startsWith("myiot_")) return;

  if (!isAllowed(email)) {
    throw new HttpsError(
      "permission-denied",
      `Access denied. ${email} is not authorized to use this system.`
    );
  }
});