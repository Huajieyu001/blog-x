import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

const mediaPathPattern = /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type MarkdownNode = {
  type: string;
  url?: unknown;
  identifier?: unknown;
  children?: MarkdownNode[];
};

export type LegacyMediaReview = "clear" | "review_required";

export type ArticleMediaClassification = {
  legacyMediaReview: LegacyMediaReview;
  invalidMarkdownSources: string[];
  invalidCoverUrl: boolean;
};

export function isMediaPath(value: unknown): value is string {
  return typeof value === "string" && mediaPathPattern.test(value);
}

function inspectMarkdownImageSources(markdown: string) {
  const root = unified().use(remarkParse).use(remarkGfm).parse(markdown) as MarkdownNode;
  const definitions = new Map<string, string>();
  const imageReferences: string[] = [];
  const imageSources: string[] = [];

  function visit(node: MarkdownNode) {
    if (node.type === "definition" && typeof node.identifier === "string" && typeof node.url === "string") {
      definitions.set(node.identifier.toLowerCase(), node.url);
    }
    if (node.type === "image" && typeof node.url === "string") imageSources.push(node.url);
    if (node.type === "imageReference" && typeof node.identifier === "string") imageReferences.push(node.identifier.toLowerCase());
    node.children?.forEach(visit);
  }

  visit(root);
  for (const identifier of imageReferences) imageSources.push(definitions.get(identifier) ?? "");
  return imageSources;
}

export function classifyArticleMedia({ markdown, coverUrl }: { markdown: string; coverUrl: string }): ArticleMediaClassification {
  const invalidMarkdownSources = inspectMarkdownImageSources(markdown).filter((source) => !isMediaPath(source));
  const invalidCoverUrl = coverUrl.length > 0 && !isMediaPath(coverUrl);
  return {
    legacyMediaReview: invalidMarkdownSources.length || invalidCoverUrl ? "review_required" : "clear",
    invalidMarkdownSources,
    invalidCoverUrl,
  };
}
