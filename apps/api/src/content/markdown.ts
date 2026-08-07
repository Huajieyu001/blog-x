import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { codeToHast } from "shiki";
import { unified } from "unified";

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
      if (language) {
        try {
          tree.children.splice(index, 1, ...(await codeToHast(textContent(code), { lang: language, theme: "github-light" })).children as HastNode[]);
          continue;
        } catch {
          // Unknown languages remain escaped code.
        }
      }
    }
    await highlightCode(node);
  }
}

export async function renderMarkdown(markdown: string) {
  const parser = unified().use(remarkParse).use(remarkGfm).use(remarkRehype, { allowDangerousHtml: false });
  const tree = await parser.run(parser.parse(markdown));
  await highlightCode(tree as HastNode);
  const sanitizer = unified().use(rehypeSanitize).use(rehypeStringify);
  const sanitizedTree = await sanitizer.run(tree);
  return String(sanitizer.stringify(sanitizedTree));
}
