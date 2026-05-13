/**
 * Run once to seed Firestore with the Alta Vision product catalog.
 * node scripts/seed-products.js
 */

const admin = require("firebase-admin");
const serviceAccount = require("../firebase-service-account.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const PANELS = [
  { type: "panel", brand: "Trina Solar", model: "TSM-620NEG19RC.20", wattage: 620, ratingLabel: "620W", cellType: "Mono", dimensions: "2384×1096 mm", warranty: "Twelve (12) Years Product Warranty\n(30) Years Linear Power Warranty for 80% of output", powerWarranty: "30 yr linear 80%", origin: "China", manufacture: "China", active: true },
  { type: "panel", brand: "Trina Solar", model: "TSM-550DEH18.08", wattage: 550, ratingLabel: "550W", cellType: "Mono", dimensions: "2190×1096 mm", warranty: "Twelve (12) Years Product Warranty\n(30) Years Linear Power Warranty for 80% of output", powerWarranty: "30 yr linear 80%", origin: "China", manufacture: "China", active: true },
  { type: "panel", brand: "JA Solar", model: "JAM72S30-545", wattage: 545, ratingLabel: "545W", cellType: "Mono", dimensions: "2200×1090 mm", warranty: "Twelve (12) Years Product Warranty\n(25) Years Linear Power Warranty for 80% of output", powerWarranty: "25 yr linear 80%", origin: "China", manufacture: "China", active: true },
  { type: "panel", brand: "Canadian Solar", model: "CS6W-550MS", wattage: 550, ratingLabel: "550W", cellType: "Mono", dimensions: "2256×1133 mm", warranty: "Twelve (12) Years Product Warranty\n(25) Years Linear Power Warranty for 80% of output", powerWarranty: "25 yr linear 80%", origin: "Canada", manufacture: "China", active: true },
];

const INVERTERS = [
  { type: "inverter", brand: "GoodWe", model: "GW5000-DNS-30", ratedPower: "5kW", phase: "Single Phase", sysTypes: ["ongrid"], warranty: "Ten (10) Years Product Warranty", maxDcInput: "6600W", mppt_range: "80-500V", origin: "China", manufacture: "China", active: true },
  { type: "inverter", brand: "GoodWe", model: "GW6000-DNS-30", ratedPower: "6kW", phase: "Single Phase", sysTypes: ["ongrid"], warranty: "Ten (10) Years Product Warranty", maxDcInput: "7800W", mppt_range: "80-500V", origin: "China", manufacture: "China", active: true },
  { type: "inverter", brand: "GoodWe", model: "GW10K-MT", ratedPower: "10kW", phase: "Three Phase", sysTypes: ["ongrid"], warranty: "Ten (10) Years Product Warranty", maxDcInput: "12500W", mppt_range: "80-500V", origin: "China", manufacture: "China", active: true },
  { type: "inverter", brand: "GoodWe", model: "GW20K-MT", ratedPower: "20kW", phase: "Three Phase", sysTypes: ["ongrid"], warranty: "Ten (10) Years Product Warranty", maxDcInput: "25000W", mppt_range: "80-500V", origin: "China", manufacture: "China", active: true },
  { type: "inverter", brand: "GoodWe", model: "GW5000-ES-C10", ratedPower: "5kW", phase: "Single Phase", sysTypes: ["hybrid", "offgrid"], warranty: "Five (5) Years Product Warranty", maxDcInput: "6500W", mppt_range: "100-550V", origin: "China", manufacture: "China", active: true },
  { type: "inverter", brand: "GoodWe", model: "GW5000-ES-20", ratedPower: "5kW", phase: "Single Phase", sysTypes: ["hybrid", "offgrid"], warranty: "Five (5) Years Product Warranty", maxDcInput: "6500W", mppt_range: "100-550V", origin: "China", manufacture: "China", active: true },
  { type: "inverter", brand: "GoodWe", model: "GW10K-ET", ratedPower: "10kW", phase: "Three Phase", sysTypes: ["hybrid", "offgrid"], warranty: "Five (5) Years Product Warranty", maxDcInput: "13000W", mppt_range: "80-550V", origin: "China", manufacture: "China", active: true },
  { type: "inverter", brand: "GoodWe", model: "GW20K-ET-20", ratedPower: "20kW", phase: "Three Phase", sysTypes: ["hybrid", "offgrid"], warranty: "Five (5) Years Product Warranty", maxDcInput: "26000W", mppt_range: "80-800V", origin: "China", manufacture: "China", active: true },
];

const BATTERIES = [
  { type: "battery", brand: "Ampere Arc", model: "AA-05.105-G", capacityKwh: 5, rating: "5kWh", chemistry: "LiFePO4", cycles: 6000, warranty: "Five (5) Years Product Warranty", origin: "China", manufacture: "China", active: true },
  { type: "battery", brand: "Ampere Arc", model: "AA-16.105-G", capacityKwh: 16, rating: "16kWh", chemistry: "LiFePO4", cycles: 6000, warranty: "Five (5) Years Product Warranty", origin: "China", manufacture: "China", active: true },
  { type: "battery", brand: "GoodWe", model: "LX U5.0-30", capacityKwh: 5, rating: "5kWh", chemistry: "LiFePO4", cycles: 6000, warranty: "Five (5) Years Product Warranty", origin: "China", manufacture: "China", active: true },
  { type: "battery", brand: "GoodWe", model: "LX U16.0-30", capacityKwh: 16, rating: "16kWh", chemistry: "LiFePO4", cycles: 6000, warranty: "Five (5) Years Product Warranty", origin: "China", manufacture: "China", active: true },
  { type: "battery", brand: "QAD", model: "QAD-16kWh", capacityKwh: 16, rating: "16kWh", chemistry: "LiFePO4", cycles: 5000, warranty: "Five (5) Years Product Warranty", origin: "China", manufacture: "China", active: true },
];

async function seed() {
  const batch = db.batch();
  const now = new Date().toISOString();

  for (const product of [...PANELS, ...INVERTERS, ...BATTERIES]) {
    const ref = db.collection("products").doc();
    batch.set(ref, { ...product, createdAt: now, updatedAt: now });
  }

  await batch.commit();
  console.log("✅ Seeded", PANELS.length + INVERTERS.length + BATTERIES.length, "products");
  process.exit(0);
}

seed().catch((err) => { console.error(err); process.exit(1); });
