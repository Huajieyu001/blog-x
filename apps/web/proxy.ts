import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { searchEncodingHeaderName, validateRawSearchEncoding } from "./lib/search-encoding";

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(searchEncodingHeaderName, validateRawSearchEncoding(request.nextUrl.search) ? "valid" : "invalid");
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = { matcher: "/search" };
