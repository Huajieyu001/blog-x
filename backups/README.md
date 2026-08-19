# Hexo 服务器备份（2026-08-05）

## 文件说明

- `hexo-source-20260805.tar.gz`：来自服务器 `/root/myBlog` 的 Hexo 源工程，并包含 `/root/deploy.sh`。
- `hexo-published-20260805.tar.gz`：来自 `/usr/share/nginx/html/blog` 的完整发布目录快照。
- `SHA256SUMS`：下载后校验通过的 SHA-256 哈希。

## 源码包内容

源码包保留文章、站点配置、主题配置、脚手架、`package.json` 和 `package-lock.json`。以下内容可重新生成，因此未收入源码包：

- `node_modules/`
- `public/`
- `db.json`

恢复依赖和生成静态站点时，可在解压出的 `myBlog` 目录执行：

```bash
npm ci
npx hexo clean
npx hexo generate
```

## 发布快照说明

发布快照包含当前维护首页、其他已生成页面，以及替换前的首页：

```text
blog/index.html.backup-20260805-1958
```

使用备份前，可在本目录运行：

```bash
shasum -a 256 -c SHA256SUMS
```
