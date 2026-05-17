export interface SolarMetrics {
  totalCapacityKw: number;
  annualGenerationKwh: number;
  monthlyData: Array<{
    month: string;
    sunHours: number;
    generation: number;
    savings: number;
  }>;
  financial: {
    breakEvenYears: number;
    lifetimeGenerationMwh: number;
    lifetimeProfit: number;
    annualSavings: number;
  };
  environmental: {
    co2SavedKgPerYear: number;
    treesPlanted: number;
    carDistanceAvoidedKm: number;
  };
}

const MONTHS = [
  { name: "Jan", sunHours: 5.5 },
  { name: "Feb", sunHours: 5.7 },
  { name: "Mar", sunHours: 6.0 },
  { name: "Apr", sunHours: 5.8 },
  { name: "May", sunHours: 5.5 },
  { name: "Jun", sunHours: 5.2 },
  { name: "Jul", sunHours: 5.0 },
  { name: "Aug", sunHours: 5.1 },
  { name: "Sep", sunHours: 5.3 },
  { name: "Oct", sunHours: 5.5 },
  { name: "Nov", sunHours: 5.5 },
  { name: "Dec", sunHours: 5.3 },
];

export function calculateSolarMetrics(
  panelCount: number,
  panelRatingW: number,
  systemCostRs: number
): SolarMetrics {
  // 1. Capacity
  const totalCapacityKw = (panelCount * panelRatingW) / 1000;
  
  // 2. Generation & Savings
  // Assuming system efficiency of ~80% (0.8 derate factor)
  const systemEfficiency = 0.8;
  const avgTariffRs = 55; // Estimated Rs/kWh blended tariff for ROI
  
  let annualGenerationKwh = 0;
  const monthlyData = MONTHS.map(m => {
    const daysInMonth = 30.4;
    const gen = totalCapacityKw * m.sunHours * daysInMonth * systemEfficiency;
    annualGenerationKwh += gen;
    return {
      month: m.name,
      sunHours: m.sunHours,
      generation: Math.round(gen),
      savings: Math.round(gen * avgTariffRs)
    };
  });

  const annualSavings = annualGenerationKwh * avgTariffRs;
  
  // 3. Financials
  // Break even calculation
  const breakEvenYears = annualSavings > 0 ? Number((systemCostRs / annualSavings).toFixed(1)) : 0;
  const lifetimeYears = 25;
  const lifetimeGenerationMwh = (annualGenerationKwh * lifetimeYears) / 1000;
  // Profit = Total Savings over 25 years minus initial cost
  // In reality, this involves inflation and discount rates, but keeping it simple for the UI.
  const lifetimeProfit = (annualSavings * lifetimeYears) - systemCostRs;

  // 4. Environmental Impact
  // Standard conversion factors: ~0.709 kg CO2 per kWh (depends on grid, typical fossil-heavy grid)
  const co2Factor = 0.709;
  const co2SavedKgPerYear = annualGenerationKwh * co2Factor;
  // ~20 kg CO2 absorbed by a mature tree per year
  const treesPlanted = Math.round(co2SavedKgPerYear / 20);
  // Avg car emits ~192g CO2/km
  const carDistanceAvoidedKm = Math.round(co2SavedKgPerYear / 0.192);

  return {
    totalCapacityKw: Number(totalCapacityKw.toFixed(2)),
    annualGenerationKwh: Math.round(annualGenerationKwh),
    monthlyData,
    financial: {
      breakEvenYears,
      lifetimeGenerationMwh: Number(lifetimeGenerationMwh.toFixed(1)),
      lifetimeProfit: Math.round(lifetimeProfit),
      annualSavings: Math.round(annualSavings),
    },
    environmental: {
      co2SavedKgPerYear: Math.round(co2SavedKgPerYear),
      treesPlanted,
      carDistanceAvoidedKm
    }
  };
}
