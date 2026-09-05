import { isIP } from "node:net";
import { isAbsolute } from "node:path";

export type ApiCommand = "serve" | "migrate" | "seed" | "schema:verify" | "portable-export" | "publish-due" | "cleanup-views";

export type RateLimitConfig = {
  login: { limit: number; windowMs: number };
  request: { limit: number; windowMs: number };
  administratorMutation: { limit: number; windowMs: number };
  storeCapacity: number;
};

export type ApiRuntimeConfig = {
  command: ApiCommand;
  nodeEnv: string;
  databaseUrl: string;
  publicOrigin?: string;
  apiHost: string;
  apiPort: number;
  trustedProxyAddresses: string[];
  mediaRoot?: string;
  administrator?: { username: string; password: string };
  rateLimits: RateLimitConfig;
};

type Environment = Record<string, string | undefined>;

function invalid(name: string): never {
  throw new Error(`invalid runtime configuration: ${name}`);
}

function required(environment: Environment, name: string) {
  const value = environment[name];
  if (!value) invalid(name);
  return value;
}

function boundedInteger(environment: Environment, name: string, fallback: number, minimum: number, maximum: number) {
  const raw = environment[name];
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) invalid(name);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) invalid(name);
  return value;
}

function parsePublicOrigin(value: string, production: boolean) {
  let url: URL;
  try { url = new URL(value); } catch { return invalid("PUBLIC_ORIGIN"); }
  if (!/^https?:$/.test(url.protocol)
    || (production && url.protocol !== "https:")
    || url.username || url.password
    || url.pathname !== "/" || url.search || url.hash) invalid("PUBLIC_ORIGIN");
  return url.origin;
}

function parseDatabaseUrl(value: string) {
  try {
    const url = new URL(value);
    if (!/^postgres(?:ql)?:$/.test(url.protocol) || !url.hostname || !url.pathname || url.pathname === "/") invalid("DATABASE_URL");
  } catch {
    invalid("DATABASE_URL");
  }
  return value;
}

function parseTrustedProxyAddresses(environment: Environment) {
  const raw = environment.TRUSTED_PROXY_CIDRS;
  if (raw === undefined || raw === "") return ["127.0.0.1/8", "::1/128"];
  const addresses = raw.split(",").map((value) => value.trim()).filter(Boolean);
  const valid = (value: string) => {
    const [address, rawPrefix, ...extra] = value.split("/");
    if (!address || extra.length || !isIP(address)) return false;
    const version = isIP(address);
    const prefix = rawPrefix === undefined ? (version === 4 ? 32 : 128) : Number(rawPrefix);
    if (!/^\d+$/.test(rawPrefix ?? String(prefix)) || !Number.isSafeInteger(prefix) || prefix < 0 || prefix > (version === 4 ? 32 : 128)) return false;
    if (version === 4) {
      const [first, second] = address.split(".").map(Number);
      return (first === 10 && prefix >= 8)
        || (first === 127 && prefix >= 8)
        || (first === 172 && second >= 16 && second <= 31 && prefix >= 12)
        || (first === 192 && second === 168 && prefix >= 16);
    }
    const normalized = address.toLowerCase();
    return (normalized === "::1" && prefix === 128) || (/^f[cd][0-9a-f:]*$/.test(normalized) && prefix >= 7);
  };
  if (!addresses.length || addresses.some((value) => !valid(value))) invalid("TRUSTED_PROXY_CIDRS");
  return addresses;
}

function defaultRateLimits(): RateLimitConfig {
  return {
    login: { limit: 5, windowMs: 60_000 },
    request: { limit: 300, windowMs: 60_000 },
    administratorMutation: { limit: 120, windowMs: 60_000 },
    storeCapacity: 4096,
  };
}

function parseRateLimits(environment: Environment): RateLimitConfig {
  return {
    login: {
      limit: boundedInteger(environment, "BLOG_X_LOGIN_LIMIT", 5, 1, 100),
      windowMs: boundedInteger(environment, "BLOG_X_LOGIN_WINDOW_MS", 60_000, 1_000, 60 * 60 * 1000),
    },
    request: {
      limit: boundedInteger(environment, "BLOG_X_REQUEST_LIMIT", 300, 1, 10_000),
      windowMs: boundedInteger(environment, "BLOG_X_REQUEST_WINDOW_MS", 60_000, 1_000, 60 * 60 * 1000),
    },
    administratorMutation: {
      limit: boundedInteger(environment, "BLOG_X_ADMIN_MUTATION_LIMIT", 120, 1, 10_000),
      windowMs: boundedInteger(environment, "BLOG_X_ADMIN_MUTATION_WINDOW_MS", 60_000, 1_000, 60 * 60 * 1000),
    },
    storeCapacity: boundedInteger(environment, "BLOG_X_RATE_STORE_CAPACITY", 4096, 1, 65_536),
  };
}

/** Parses only names and shapes; rejected environment values are deliberately never echoed. */
export function parseApiRuntimeConfig(environment: Environment, command: ApiCommand = "serve"): ApiRuntimeConfig {
  const nodeEnv = environment.NODE_ENV ?? "development";
  const production = nodeEnv === "production";
  const databaseUrl = parseDatabaseUrl(required(environment, "DATABASE_URL"));
  const result: ApiRuntimeConfig = {
    command,
    nodeEnv,
    databaseUrl,
    apiHost: "127.0.0.1",
    apiPort: 3001,
    trustedProxyAddresses: parseTrustedProxyAddresses(environment),
    rateLimits: defaultRateLimits(),
  };
  if (command === "serve") {
    result.publicOrigin = parsePublicOrigin(required(environment, "PUBLIC_ORIGIN"), production);
    // The API has no Compose host port. Binding all container interfaces keeps
    // the Web-to-API private Docker network reachable without publishing it.
    result.apiHost = environment.API_HOST ?? "0.0.0.0";
    result.apiPort = boundedInteger(environment, "API_PORT", 3001, 1, 65_535);
    result.rateLimits = parseRateLimits(environment);
    const mediaRoot = required(environment, "MEDIA_ROOT");
    if (!isAbsolute(mediaRoot)) invalid("MEDIA_ROOT");
    result.mediaRoot = mediaRoot;
  }
  if (command === "seed") {
    result.administrator = {
      username: required(environment, "ADMIN_USERNAME"),
      password: required(environment, "ADMIN_PASSWORD"),
    };
  }
  return result;
}
