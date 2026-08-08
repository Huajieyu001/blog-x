import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { createHighlighter, type BundledLanguage } from "shiki";
import { unified } from "unified";

const highlightedLanguages = [
  "bash",
  "css",
  "html",
  "javascript",
  "json",
  "markdown",
  "python",
  "sql",
  "typescript",
  "yaml",
] as const satisfies readonly BundledLanguage[];

const languageAliases: Readonly<Record<string, (typeof highlightedLanguages)[number]>> = {
  bash: "bash",
  css: "css",
  html: "html",
  javascript: "javascript",
  js: "javascript",
  json: "json",
  markdown: "markdown",
  md: "markdown",
  py: "python",
  python: "python",
  sh: "bash",
  shell: "bash",
  sql: "sql",
  ts: "typescript",
  typescript: "typescript",
  yaml: "yaml",
  yml: "yaml",
};

const highlighter = createHighlighter({
  langs: [...highlightedLanguages],
  themes: ["github-light"],
});

const markdownSanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    pre: [...(defaultSchema.attributes?.pre ?? []), ["class", /^shiki github-light$/], "style", "tabindex"],
    span: [...(defaultSchema.attributes?.span ?? []), ["class", "line"], "style"],
  },
};

type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  value?: string;
  children?: HastNode[];
};

function textContent(node: HastNode): string {
  return node.value ?? node.children?.map(textContent).join("") ?? "";
}

async function highlightCode(tree: HastNode) {
  if (!tree.children) return;
  for (let index = 0; index < tree.children.length; index += 1) {
    const node = tree.children[index];
    if (node.tagName === "pre" && node.children?.[0]?.tagName === "code") {
      const code = node.children[0];
      const className = code.properties?.className;
      const language = Array.isArray(className)
        ? className.find((name): name is string => typeof name === "string" && name.startsWith("language-"))?.slice(9)
        : undefined;
      const supportedLanguage = language ? languageAliases[language.toLowerCase()] : undefined;
      if (supportedLanguage) {
        const highlighted = (await highlighter).codeToHast(textContent(code), { lang: supportedLanguage, theme: "github-light" });
        tree.children.splice(index, 1, ...highlighted.children as HastNode[]);
        continue;
      }
    }
    await highlightCode(node);
  }
}

export async function renderMarkdown(markdown: string) {
  const parser = unified().use(remarkParse).use(remarkGfm).use(remarkRehype, { allowDangerousHtml: false });
  const tree = await parser.run(parser.parse(markdown));
  await highlightCode(tree as HastNode);
  // Raw HTML is disabled before highlighting. These attributes are therefore
  // emitted only by Shiki and can survive the final sanitizer safely.
  const sanitizer = unified().use(rehypeSanitize, markdownSanitizeSchema).use(rehypeStringify);
  const sanitizedTree = await sanitizer.run(tree);
  return String(sanitizer.stringify(sanitizedTree));
}
