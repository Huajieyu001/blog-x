import MediaLibrary from "../_components/MediaLibrary";
import styles from "../admin.module.css";

export default function AdminMediaPage() {
  return (
    <main className={styles.workspace} aria-labelledby="media-library-page-title">
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.eyebrow}>BLOG X / 媒体管理</p>
          <h1 id="media-library-page-title">媒体库</h1>
          <p>查看已上传图片的使用状态，并安全清理没有被内容引用的媒体。</p>
        </div>
        <a className={styles.secondaryLink} href="/admin">返回工作台</a>
      </header>
      <MediaLibrary mode="manage" />
    </main>
  );
}
