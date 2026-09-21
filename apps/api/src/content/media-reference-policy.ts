import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { and, inArray, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";

const mediaPathPattern = /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const settingsMediaPathPattern = /(?<![0-9a-z])\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?![0-9a-z_-]|[?#])/g;

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

/**
 * Extracts only real Markdown image/imageReference URLs.  This shares the
 * renderer's AST semantics, so UUID-looking prose, links, and code blocks do
 * not accidentally keep a file alive.
 */
export function extractArticleMediaIds(markdown: string): Set<string> {
  const ids = new Set<string>();
  for (const source of inspectMarkdownImageSources(markdown)) {
    if (!isMediaPath(source)) continue;
    ids.add(source.slice("/media/".length).toLowerCase());
  }
  return ids;
}

/**
 * Site settings are not Markdown. Treat every exact lower-case root media
 * path as a reference, including future rich-text-like values, so an unknown
 * settings field fails closed rather than silently dropping an asset.
 */
export function extractSettingsMediaIds(values: Iterable<string>): Set<string> {
  const ids = new Set<string>();
  for (const value of values) {
    settingsMediaPathPattern.lastIndex = 0;
    for (const match of value.matchAll(settingsMediaPathPattern)) ids.add(match[1]!);
  }
  return ids;
}

export function articleMediaIds(input: { markdown: string; coverMediaId?: string | null }) {
  const ids = extractArticleMediaIds(input.markdown);
  if (input.coverMediaId) ids.add(input.coverMediaId.toLowerCase());
  return ids;
}

type MediaReferenceExecutor = Pick<NodePgDatabase<typeof schema>, "execute" | "select">;

export async function lockMediaReferences(executor: MediaReferenceExecutor, values: Iterable<string>) {
  const ids = [...new Set(values)].sort();
  for (const id of ids) {
    await executor.execute(sql`select pg_advisory_xact_lock(hashtext(${`blog-x-media:${id}`}))`);
  }
  return ids;
}

/**
 * Writers and media tombstoning agree on this sorted lock order. The retained
 * row check happens while those transaction locks are held, so a writer either
 * commits a valid reference or observes the tombstone and fails.
 */
export async function lockRetainedMediaReferences(executor: MediaReferenceExecutor, values: Iterable<string>) {
  const ids = await lockMediaReferences(executor, values);
  if (!ids.length) return;
  const rows = await executor.select({ id: schema.media.id }).from(schema.media)
    .where(and(inArray(schema.media.id, ids), isNull(schema.media.deletedAt)))
    .for("key share");
  if (rows.length !== ids.length || ids.some((id) => !rows.some((row) => row.id === id))) {
    throw new Error("media reference is missing or deleted");
  }
}
