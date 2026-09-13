import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import AdminLoadFailure from "../../_components/AdminLoadFailure";
import ArticleEditor from "../../_components/ArticleEditor";
import ArticleActions from "../../_components/ArticleActions";
import { getAdminPostResult, getAdminTaxonomyResult } from "../../../lib/api";
import styles from "../../admin.module.css";

export default async function EditDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookie = (await cookies()).toString();
  const [post, categories, tags] = await Promise.all([
    getAdminPostResult(id, cookie),
    getAdminTaxonomyResult("categories", cookie),
    getAdminTaxonomyResult("tags", cookie),
  ]);
  if (post.kind === "not_found") notFound();
  if (post.kind === "upstream_error" || categories.kind === "upstream_error" || tags.kind === "upstream_error") {
    return <AdminLoadFailure eyebrow="BLOG X / 编辑文章" title="编辑文章" description="修改正文、元数据和发布状态。" message="文章、分类或标签暂时无法读取。" retryHref={`/admin/posts/${encodeURIComponent(id)}`} />;
  }
  return (
    <>
      <ArticleEditor post={post.data} heading="编辑文章" categories={categories.data} tags={tags.data} />
      <div className={styles.nativeLifecycleFallback} data-testid="native-lifecycle-fallback">
        <ArticleActions post={post.data} />
      </div>
    </>
  );
}
