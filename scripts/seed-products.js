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

  const adminApp = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: processedKey,
    }),
  });
  console.log("✅ Firebase Admin SDK initialized successfully!");

  const db = getFirestore();

  async function seed() {
    const productsCol = db.collection("products");

    // Add Jinko Panel
    const panel = {
      type: "panel",
      brand: "Jinko",
      model: "Tiger Neo 575W",
      origin: "China",
      manufacture: "China",
      active: true,
      max_panel_output_power: 575,
      panel_type: "Monocrystalline",
      max_efficiency: 21.3,
      panel_voltage: 41.8,
      width: 1096,
      height: 2384,
      length: 35,
      warranty: 12,
      qty: 100,
      buy_price: 40000,
      sell_price: 45000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Add Solis Inverter
    const inverter = {
      type: "inverter",
      brand: "Solis",
      model: "S5-GR3P10K",
      origin: "China",
      manufacture: "China",
      active: true,
      inverter_type: "ongrid",
      phase_count: "Three Phase",
      input_rated_power: 10000,
      max_input_power: 15000,
      max_input_voltage: 600,
      min_input_voltage: 200,
      nominal_input_voltage: 400,
      pv_string_count: 2,
      mppt_count: 2,
      max_output_current: 22.7,
      warranty: 5,
      qty: 20,
      buy_price: 250000,
      sell_price: 280000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    console.log("Seeding panel...");
    await productsCol.add(panel);
    console.log("Seeding inverter...");
    await productsCol.add(inverter);
    console.log("✅ Database seeded with default products successfully!");
    process.exit(0);
  }

  seed();
} catch (err) {
  console.error("❌ Firebase Admin SDK initialization failed:", err.message);
  console.error(err);
  process.exit(1);
}
