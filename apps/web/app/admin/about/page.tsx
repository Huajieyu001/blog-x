import { cookies } from "next/headers";
import { getAdminAbout } from "../../lib/api";
import AboutEditor from "../_components/AboutEditor";

export default async function AdminAboutPage() {
  return <AboutEditor initial={await getAdminAbout((await cookies()).toString())} />;
}
