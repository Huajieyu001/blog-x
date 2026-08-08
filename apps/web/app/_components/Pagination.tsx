import styles from "../public.module.css";

function pageHref(page: number) {
  return page === 1 ? "/" : `/?page=${page}`;
}

function visiblePages(current: number, total: number) {
  return [...new Set([1, current - 1, current, current + 1, total])]
    .filter((page) => page >= 1 && page <= total)
    .sort((left, right) => left - right);
}

export default function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  if (totalPages <= 1 || page > totalPages) return null;
  const pages = visiblePages(page, totalPages);

  return (
    <nav className={styles.pagination} aria-label="文章分页">
      {page > 1
        ? <a className={styles.direction} href={pageHref(page - 1)}>上一页</a>
        : <span className={styles.direction} aria-disabled="true">上一页</span>}
      <ol>
        {pages.map((number, index) => (
          <li key={number}>
            {index > 0 && pages[index - 1] !== number - 1 ? <span className={styles.ellipsis} aria-hidden="true">…</span> : null}
            <a
              href={pageHref(number)}
              aria-label={`第 ${number} 页`}
              aria-current={number === page ? "page" : undefined}
            >
              {String(number).padStart(2, "0")}
            </a>
          </li>
        ))}
      </ol>
      {page < totalPages
        ? <a className={styles.direction} href={pageHref(page + 1)}>下一页</a>
        : <span className={styles.direction} aria-disabled="true">下一页</span>}
    </nav>
  );
}
