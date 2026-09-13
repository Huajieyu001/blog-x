import { cookies } from "next/headers";
import { getAdminTaxonomyResult } from "../../lib/api";
import AdminLoadFailure from "../_components/AdminLoadFailure";
import ArticleEditor from "../_components/ArticleEditor";

export default async function NewDraftPage() {
  const cookie = (await cookies()).toString();
  const [categories, tags] = await Promise.all([
    getAdminTaxonomyResult("categories", cookie),
    getAdminTaxonomyResult("tags", cookie),
  ]);
  if (categories.kind === "upstream_error" || tags.kind === "upstream_error") {
    return <AdminLoadFailure eyebrow="BLOG X / 新建文章" title="新建草稿" description="从 Markdown 开始记录并保存你的想法。" message="分类或标签暂时无法读取。" retryHref="/admin/new" />;
  }
  return <ArticleEditor heading="新建草稿" categories={categories.data} tags={tags.data} />;
}
