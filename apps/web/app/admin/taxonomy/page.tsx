import { cookies } from "next/headers";
import TaxonomyManager from "../_components/TaxonomyManager";
const api = process.env.INTERNAL_API_ORIGIN ?? "http://127.0.0.1:3001";
async function terms(kind: "categories" | "tags", cookie: string) { try { const response = await fetch(`${api}/admin/${kind}`, { cache: "no-store", headers: { cookie } }); if (!response.ok) return []; return ((await response.json()) as { items: Array<{ id: string; name: string; slug: string; articleCount: number }> }).items; } catch { return []; } }
export default async function TaxonomyPage() { const cookie = (await cookies()).toString(); const [categories, tags] = await Promise.all([terms("categories", cookie), terms("tags", cookie)]); return <section><h1>分类与标签</h1><TaxonomyManager kind="categories" initialTerms={categories} /><TaxonomyManager kind="tags" initialTerms={tags} /></section>; }
