import TracerAdmin from "../TracerAdmin";

export default function AdminPage() {
  return (
    <>
      <nav aria-label="内容管理"><a href="/admin/new">打开完整草稿编辑器</a></nav>
      <TracerAdmin initiallyAuthenticated />
    </>
  );
}
