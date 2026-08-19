import "fastify";

// @fastify/cookie does not declare Fastify as a peer dependency, so pnpm's
// isolated layout cannot resolve its module augmentation from the package's
// declaration file. Keep the two runtime members used by this API explicit.
declare module "fastify" {
  interface FastifyRequest {
    cookies: Record<string, string | undefined>;
  }

  interface FastifyReply {
    setCookie(name: string, value: string, options?: Record<string, unknown>): this;
  }
}
