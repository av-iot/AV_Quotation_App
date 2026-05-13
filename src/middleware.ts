import { NextRequest, NextResponse } from "next/server";

// Routes that never need auth
const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/_next",
  "/favicon.ico",
  "/public",
];

// Routes that always require auth
const PROTECTED_PATHS = [
  "/proposals",
  "/quotations",
  "/settings",
  "/api/proposals",
  "/api/quotations",
  "/api/products",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow all public paths through — no auth check
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  // Only protect explicitly listed routes
  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  // Check session cookie
  const session = req.cookies.get("__session")?.value;
  if (!session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};