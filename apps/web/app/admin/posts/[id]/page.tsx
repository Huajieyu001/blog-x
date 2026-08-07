import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import ArticleEditor from "../../_components/ArticleEditor";
import { getAdminPost } from "../../../lib/api";

export default async function EditDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getAdminPost(id, (await cookies()).toString());
  if (!post) notFound();
  return <ArticleEditor post={post} heading="编辑草稿" />;
}
