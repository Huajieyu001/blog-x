import Link from "next/link";
import styles from "../public.module.css";

function pageHref(page: number, basePath: string) { return page === 1 ? basePath : `${basePath}?page=${page}`; }

function visiblePages(current: number, total: number) {
  return [...new Set([1, current - 1, current, current + 1, total])]
    .filter((page) => page >= 1 && page <= total)
    .sort((left, right) => left - right);
}

type PaginationProps = {
  page: number;
  totalPages: number;
  basePath?: string;
  ariaLabel?: string;
  hrefForPage?: (page: number) => string;
};

export default function Pagination({
  page,
  totalPages,
  basePath = "/",
  ariaLabel = "文章分页",
  hrefForPage,
}: PaginationProps) {
  if (totalPages <= 1 || page > totalPages) return null;
  const pages = visiblePages(page, totalPages);
  const href = hrefForPage ?? ((number: number) => pageHref(number, basePath));

  return (
    <nav className={styles.pagination} aria-label={ariaLabel}>
      {page > 1
        ? <Link className={styles.direction} href={href(page - 1)}>上一页</Link>
        : <span className={styles.direction} aria-disabled="true">上一页</span>}
      <ol>
        {pages.map((number, index) => (
          <li key={number}>
            {index > 0 && pages[index - 1] !== number - 1 ? <span className={styles.ellipsis} aria-hidden="true">…</span> : null}
            <Link
              href={href(number)}
              aria-label={`第 ${number} 页`}
              aria-current={number === page ? "page" : undefined}
            >
              {String(number).padStart(2, "0")}
            </Link>
          </li>
        ))}
      </ol>
      {page < totalPages
        ? <Link className={styles.direction} href={href(page + 1)}>下一页</Link>
        : <span className={styles.direction} aria-disabled="true">下一页</span>}
    </nav>
  );
}
