import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

// Basic token validation against an environment variable
// In production, ensure EXTERNAL_API_KEY is set in .env.local or deployment variables
const API_KEY = process.env.EXTERNAL_API_KEY || "av-dev-secret-key";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid authorization header" }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];
    if (token !== API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const db = adminDb();
    
    // Fetch all confirmed/converted proposals
    // (Assuming services apply to systems that have been confirmed)
    const proposalsRef = db.collection("proposals");
    const snapshot = await proposalsRef.where("status", "in", ["confirmed", "converted", "partial"]).get();

    const upcomingServices: any[] = [];
    const now = new Date();

    snapshot.forEach((doc) => {
      const data = doc.data();
      if (!data.options || data.options.length === 0) return;

      // Assuming option 0 is the selected one for simplicity in this logic
      // In a robust system, we'd link to the confirmed Quotation's selectedOption
      const option = data.options[0]; 
      
      const servicesPerYear = Number(option.servicesPerYear) || 0;
      const afterSalesPeriodYears = Number(option.afterSalesPeriod) || 0;

      if (servicesPerYear <= 0 || afterSalesPeriodYears <= 0) return;

      // Calculate base date (commissioned date or confirmed date). 
      // For now, using createdAt as a fallback.
      let baseDate = data.createdAt ? new Date(data.createdAt._seconds * 1000) : null;
      if (!baseDate && data.date) baseDate = new Date(data.date);
      if (!baseDate) return;

      const monthsBetweenServices = 12 / servicesPerYear;
      const totalServicesCount = servicesPerYear * afterSalesPeriodYears;

      // Calculate all scheduled service dates
      for (let i = 1; i <= totalServicesCount; i++) {
        const serviceDate = new Date(baseDate);
        serviceDate.setMonth(serviceDate.getMonth() + (i * monthsBetweenServices));
        
        // Find the "Next" available service that is in the future
        if (serviceDate > now) {
          upcomingServices.push({
            projectNo: data.propNo || data.qtnNo,
            customerName: data.customer?.name,
            customerPhone: data.customer?.phone,
            customerAddress: data.customer?.address,
            systemType: data.sysType,
            serviceDueDate: serviceDate.toISOString(),
            serviceNumber: i,
            totalFreeServices: totalServicesCount,
            baseDate: baseDate.toISOString()
          });
          break; // Only add the *next* available one for this project
        }
      }
    });

    // Sort by due date ascending
    upcomingServices.sort((a, b) => new Date(a.serviceDueDate).getTime() - new Date(b.serviceDueDate).getTime());

    return NextResponse.json({
      success: true,
      count: upcomingServices.length,
      data: upcomingServices
    });

  } catch (error: any) {
    console.error("External API Error:", error);
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
