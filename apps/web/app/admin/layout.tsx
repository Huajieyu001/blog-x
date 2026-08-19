import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionStatus } from "../lib/api";
import LogoutButton from "./LogoutButton";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const cookieHeader = (await cookies()).toString();
  if (!await getSessionStatus(cookieHeader)) redirect("/login");

  return (
    <>
      <header><a href="/">Blog X</a><LogoutButton /></header>
      {children}
    </>
  );
}
