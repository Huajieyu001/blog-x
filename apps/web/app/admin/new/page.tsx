import { cookies } from "next/headers";
import { getAdminTaxonomy } from "../../lib/api";
import ArticleEditor from "../_components/ArticleEditor";

export default async function NewDraftPage() {
  const cookie = (await cookies()).toString();
  const [categories, tags] = await Promise.all([
    getAdminTaxonomy("categories", cookie),
    getAdminTaxonomy("tags", cookie),
  ]);
  return <ArticleEditor heading="新建草稿" categories={categories} tags={tags} />;
}
