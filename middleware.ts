import { NextResponse } from "next/server";
import { authMiddleware } from "@clerk/nextjs";

export default authMiddleware({
  publicRoutes: [
    "/",
    "/pricing",
    "/api/get-wallpapers",
    "/api/get-user-info",
    "/api/webhook/wechat",
    "/api/webhook(.*)",
    "/api/orders/wechat/status",
  ],

  afterAuth(auth, req, evt) {
    // 对于 webhook 路由，直接放行
    if (req.url.includes('/api/webhook/')) {
      return NextResponse.next();
    }

    if (!auth.userId && !auth.isPublicRoute) {
      if (auth.isApiRoute) {
        return NextResponse.json(
          { code: -2, message: "no auth" },
          { status: 401 }
        );
      } else {
        return NextResponse.redirect(new URL("/sign-in", req.url));
      }
    }

    return NextResponse.next();
  },
});

export const config = {
  matcher: [
    "/((?!.*\\..*|_next).*)",
    "/",
    "/(api|trpc)(.*)",
    "!.*/api/webhook/.*", // 排除 webhook 路由
  ],
};
