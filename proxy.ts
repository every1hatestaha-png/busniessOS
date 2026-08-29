import { clerkMiddleware } from "@clerk/nextjs/server";

export const proxy = clerkMiddleware(async (auth, request) => {
  const path = request.nextUrl.pathname;
  const isPublicRoute = path === "/api/webhooks/clerk" || path === "/sign-in" || path.startsWith("/sign-in/") || path === "/sign-up" || path.startsWith("/sign-up/");
  if (!isPublicRoute) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
