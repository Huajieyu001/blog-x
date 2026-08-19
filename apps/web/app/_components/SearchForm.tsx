import styles from "../public.module.css";

type SearchFormProps = {
  defaultValue?: string;
  tabIndex?: number;
};

export default function SearchForm({ defaultValue = "", tabIndex }: SearchFormProps) {
  return (
    <form className={styles.searchForm} action="/search" method="get" role="search" aria-label="搜索文章">
      <label>
        <span>搜索文章</span>
        <input
          className={styles.searchInput}
          type="search"
          name="q"
          maxLength={256}
          defaultValue={defaultValue}
          tabIndex={tabIndex}
        />
      </label>
      <button className={styles.searchButton} type="submit" tabIndex={tabIndex}>搜索</button>
    </form>
  );
}
