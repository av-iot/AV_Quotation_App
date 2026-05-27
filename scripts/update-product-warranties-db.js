const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

try {
  const envPath = path.join(__dirname, "..", ".env.local");

  console.log("Reading env file from:", envPath);
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        let [_, key, value] = match;
        value = value.trim().replace(/^"|"$/g, "");
        process.env[key] = value;
      }
    });
  }

  const rawKey = process.env.FIREBASE_PRIVATE_KEY || "";
  const processedKey = rawKey.replace(/\\n/g, "\n");

  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: processedKey,
    }),
  });
  console.log("✅ Firebase Admin SDK initialized successfully!");

  const db = getFirestore();

  async function updateWarranties() {
    const productsCol = db.collection("products");
    const snapshot = await productsCol.get();
    
    console.log(`Found ${snapshot.size} products. Evaluating warranties...`);
    
    let updatedCount = 0;
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const id = doc.id;
      const type = (data.type || "").toLowerCase().trim();
      const brand = (data.brand || "").toLowerCase().trim();
      const model = (data.model || "").toLowerCase().trim();
      const inverterType = (data.inverter_type || "").toLowerCase().trim();
      
      let newWarranty = data.warranty;
      let reason = "";

      if (type === "panel") {
        newWarranty = 12;
        reason = "Panels have 12 year product warranty";
      } else if (type === "battery") {
        newWarranty = 5;
        reason = "Batteries have 5 year product warranty";
      } else if (type === "inverter") {
        if (brand.includes("goodwe")) {
          if (inverterType.includes("hybrid") || model.includes("hybrid")) {
            newWarranty = 5;
            reason = "Goodwe hybrid inverter has 5 year product warranty";
          } else if (inverterType.includes("ongrid") || model.includes("ongrid") || inverterType.includes("on-grid") || model.includes("on-grid") || inverterType === "") {
            newWarranty = 10;
            reason = "Goodwe ongrid inverter has 10 year product warranty";
          }
        } else {
          // Default fallbacks for non-Goodwe
          if (inverterType.includes("hybrid")) {
            newWarranty = 5;
            reason = "Other hybrid inverter default 5 year product warranty";
          } else {
            newWarranty = 10;
            reason = "Other inverter default 10 year product warranty";
          }
        }
      }

      if (newWarranty !== data.warranty) {
        console.log(`Updating ${data.brand} ${data.model} (${type}): ${data.warranty} -> ${newWarranty} years. Reason: ${reason}`);
        await productsCol.doc(id).update({
          warranty: newWarranty,
          updatedAt: new Date().toISOString()
        });
        updatedCount++;
      } else {
        console.log(`No change for ${data.brand} ${data.model} (${type}): current warranty is ${data.warranty} years.`);
      }
    }
    
    console.log(`✅ DB Update complete. Updated ${updatedCount} products.`);
    process.exit(0);
  }

  updateWarranties();
} catch (err) {
  console.error("❌ DB update failed:", err.message);
  console.error(err);
  process.exit(1);
}
