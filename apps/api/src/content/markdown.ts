import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { createHighlighter, type BundledLanguage } from "shiki";
import { unified } from "unified";
import type { TocEntry } from "@blog-x/contracts";

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
    "*": (defaultSchema.attributes?.["*"] ?? []).filter((attribute) => attribute !== "id"),
    a: [
      ...(defaultSchema.attributes?.a ?? []).filter(
        (attribute) => !(Array.isArray(attribute) && attribute[0] === "className"),
      ),
      ["className", "heading-permalink"],
      "ariaLabel",
    ],
    h2: [...(defaultSchema.attributes?.h2 ?? []), "id"],
    h3: [...(defaultSchema.attributes?.h3 ?? []), "id"],
    pre: [...(defaultSchema.attributes?.pre ?? []), ["class", /^shiki github-light$/], "style", "tabindex"],
    span: [...(defaultSchema.attributes?.span ?? []), ["class", "line"], "style"],
  },
  // Only the renderer-generated h2/h3 IDs survive this schema, so they can
  // remain byte-for-byte stable for ordinary external hash links.
  clobber: (defaultSchema.clobber ?? []).filter((property) => property !== "id"),
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https"],
    src: ["http", "https"],
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

function headingBase(text: string): string {
  return text
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "section";
}

function addHeadingAnchors(tree: HastNode): TocEntry[] {
  const toc: TocEntry[] = [];
  const usedIds = new Set<string>();

  function visit(node: HastNode) {
    if (node.tagName === "h2" || node.tagName === "h3") {
      const text = textContent(node).replace(/\s+/g, " ").trim();
      const base = headingBase(text);
      let id = base;
      let suffix = 2;
      while (usedIds.has(id)) {
        id = `${base}-${suffix}`;
        suffix += 1;
      }
      usedIds.add(id);
      const depth = node.tagName === "h2" ? 2 : 3;
      node.properties = { ...(node.properties ?? {}), id };
      node.children = [
        ...(node.children ?? []),
        {
          type: "element",
          tagName: "a",
          properties: {
            ariaLabel: text ? `链接到“${text}”` : "链接到此章节",
            className: ["heading-permalink"],
            href: `#${id}`,
          },
          children: [{ type: "text", value: "#" }],
        },
      ];
      toc.push({ id, depth, text });
      return;
    }
    node.children?.forEach(visit);
  }

  visit(tree);
  return toc;
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
  const toc = addHeadingAnchors(tree as HastNode);
  await highlightCode(tree as HastNode);
  // Raw HTML is disabled before highlighting. These attributes are therefore
  // emitted only by Shiki and can survive the final sanitizer safely.
  const sanitizer = unified().use(rehypeSanitize, markdownSanitizeSchema).use(rehypeStringify);
  const sanitizedTree = await sanitizer.run(tree);
  return { html: String(sanitizer.stringify(sanitizedTree)), toc };
}
