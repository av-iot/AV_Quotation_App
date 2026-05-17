const { initializeApp, cert } = require("firebase-admin/app");
const fs = require("fs");
const path = require("path");

try {
  // Manually parse .env.local to avoid dotenv dependency in local test scripts
  const envPath = path.join(__dirname, ".env.local");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        let [_, key, value] = match;
        // Strip optional surrounding quotes from value
        value = value.trim().replace(/^"|"$/g, "");
        process.env[key] = value;
      }
    });
  }

  const adminApp = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
  console.log("✅ Firebase Admin SDK initialized successfully with credentials in .env.local!");
} catch (err) {
  console.error("❌ Firebase Admin SDK initialization failed:", err.message);
  console.error(err);
}
