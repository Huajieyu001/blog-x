import { publicSearchQuerySchema, type PublicSearchResponse } from "@blog-x/contracts";
import { cache } from "react";
import { getPublicSearch, type PublicResult } from "./api";

export const validSearchEncodingMarker = "valid";

type SearchParameters = Record<string, string | string[] | undefined>;

export type SearchRequestResolution =
  | { kind: "invalid" }
  | { kind: "accepted"; query: string; page: number };

type Payload<State extends PublicSearchResponse["state"]> = Omit<Extract<PublicSearchResponse, { state: State }>, "state">;

export type SearchDiscoveryOutcome =
  | { kind: "invalid" }
  | { kind: "upstream_error" }
  | ({ kind: "empty_query" } & Payload<"empty_query">)
  | ({ kind: "no_results" } & Payload<"no_results">)
  | ({ kind: "page_out_of_range" } & Payload<"page_out_of_range">)
  | ({ kind: "results" } & Payload<"results">);

type SearchFetcher = (query: string, page: number) => Promise<PublicResult<PublicSearchResponse>>;

const cachedPublicSearch = cache((query: string, page: number) => getPublicSearch(query, page));

export function resolveSearchRequest(searchParams: SearchParameters, encodingMarker: string | null): SearchRequestResolution {
  if (encodingMarker !== validSearchEncodingMarker) return { kind: "invalid" };
  const parsed = publicSearchQuerySchema.safeParse(searchParams);
  return parsed.success
    ? { kind: "accepted", query: parsed.data.q, page: parsed.data.page }
    : { kind: "invalid" };
}

export async function loadSearchDiscovery(
  searchParams: SearchParameters,
  encodingMarker: string | null,
  fetchSearch: SearchFetcher = cachedPublicSearch,
): Promise<SearchDiscoveryOutcome> {
  const request = resolveSearchRequest(searchParams, encodingMarker);
  if (request.kind === "invalid") return request;

  const result = await fetchSearch(request.query, request.page);
  if (result.kind !== "ok" || result.data.query !== request.query || result.data.page !== request.page) {
    return { kind: "upstream_error" };
  }
  const { state, ...payload } = result.data;
  return { kind: state, ...payload } as SearchDiscoveryOutcome;
}

export function searchHref(query: string, page: number) {
  const parameters = new URLSearchParams({ q: query });
  if (page > 1) parameters.set("page", String(page));
  return `/search?${parameters.toString()}`;
}

export function resolveSearchCanonical(outcome: SearchDiscoveryOutcome) {
  if (outcome.kind === "results") return searchHref(outcome.query, outcome.page);
  if (outcome.kind === "no_results" && outcome.page === 1) return searchHref(outcome.query, 1);
  return undefined;
}
