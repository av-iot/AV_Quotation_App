import { NextRequest, NextResponse } from "next/server";

// Public paths that don't require authentication or approval
const PUBLIC_PATHS = [
  "/login",
  "/pending",
  "/_next",
  "/favicon.ico",
  "/api/auth/session",
  "/api/auth/myiot",
  "/api/auth/dev-login",
];

// API paths that return JSON — return 401 instead of redirecting
const API_PATHS = ["/api/"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function isApiPath(pathname: string): boolean {
  return API_PATHS.some((p) => pathname.startsWith(p));
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Skip middleware for public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Check for __session cookie
  const sessionCookie = req.cookies.get("__session")?.value;

  if (!sessionCookie) {
    // No session — redirect to /login or return 401
    if (isApiPath(pathname)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Check if user is approved using the __user_approved cookie
  // This is set by the session creation endpoint
  // If the cookie doesn't exist (backward compat), we treat them as approved
  const userApprovedCookie = req.cookies.get("__user_approved")?.value;
  const isApproved = userApprovedCookie !== "false";

  if (!isApproved) {
    // Unapproved user — show pending page or return 403 for API
    if (isApiPath(pathname)) {
      return NextResponse.json(
        { error: "User account pending admin approval" },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL("/pending", req.url));
  }

  // User is authenticated and approved — allow request to proceed
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files, assets, etc.
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
