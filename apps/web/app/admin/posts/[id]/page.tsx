import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import ArticleEditor from "../../_components/ArticleEditor";
import ArticleActions from "../../_components/ArticleActions";
import { getAdminPost, getAdminTaxonomy } from "../../../lib/api";

export default async function EditDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookie = (await cookies()).toString();
  const [post, categories, tags] = await Promise.all([
    getAdminPost(id, cookie),
    getAdminTaxonomy("categories", cookie),
    getAdminTaxonomy("tags", cookie),
  ]);
  if (!post) notFound();
  return (
    <>
      <ArticleEditor post={post} heading="编辑草稿" categories={categories} tags={tags} />
      <noscript><ArticleActions post={post} /></noscript>
    </>
  );
}
