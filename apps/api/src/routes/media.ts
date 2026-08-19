import {
  invalidMediaResponseSchema,
  mediaIdSchema,
  mediaNotFoundResponseSchema,
} from "@blog-x/contracts";
import multipart from "@fastify/multipart";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { Multipart } from "@fastify/multipart";
import type { SessionService } from "../auth/sessions.js";
import type { MediaService } from "../content/media-service.js";
import { requireAdministratorMutation, requireContentType, type MutationGuardOptions } from "../security/mutation-guard.js";

const maximumSourceBytes = 5 * 1024 * 1024;

export const mediaRoutes: FastifyPluginAsync<{
  mediaService: MediaService;
  sessionAuth: SessionService;
  publicOrigin?: string;
  mutationGuard: MutationGuardOptions;
}> = async (app, options) => {
  await app.register(multipart, {
    limits: { files: 1, fields: 2, fieldSize: 500, fileSize: maximumSourceBytes, parts: 3 },
  });

  app.post("/admin/media", { bodyLimit: maximumSourceBytes + 64 * 1024 }, async (request, reply) => {
    if (!await requireAdministratorMutation(request, reply, options.mutationGuard)) return;
    if (!requireContentType(request, reply, "multipart/form-data")) return;
    try {
      let received: { buffer: Buffer; mimeType: string } | null = null;
      let alt = "";
      let decorative = false;
      const fields = new Set<string>();
      const parts = (request as FastifyRequest & { parts: (options: object) => AsyncIterableIterator<Multipart> }).parts;
      for await (const part of parts.call(request, { limits: { files: 1, fields: 2, fieldSize: 500, fileSize: maximumSourceBytes, parts: 3 } })) {
        if (part.type === "file") {
          if (part.fieldname !== "file" || received) throw new Error("invalid multipart shape");
          const buffer = await part.toBuffer();
          if (part.file.truncated) throw new Error("file too large");
          received = { buffer, mimeType: part.mimetype };
          continue;
        }
        if (!['alt', 'decorative'].includes(part.fieldname) || fields.has(part.fieldname) || typeof part.value !== "string") throw new Error("invalid multipart field");
        fields.add(part.fieldname);
        if (part.fieldname === "alt") alt = part.value;
        if (part.fieldname === "decorative") {
          if (!['true', 'false'].includes(part.value)) throw new Error("invalid decorative field");
          decorative = part.value === "true";
        }
      }
      if (!received) throw new Error("missing file");
      return reply.code(201).send(await options.mediaService.upload(received.buffer, received.mimeType, { alt, decorative }));
    } catch {
      return reply.code(400).send(invalidMediaResponseSchema.parse({ error: "invalid_media" }));
    }
  });

  app.get<{ Params: { id: string } }>("/media/:id", async (request, reply) => {
    const id = mediaIdSchema.safeParse(request.params.id);
    if (!id.success) return reply.code(404).send(mediaNotFoundResponseSchema.parse({ error: "not_found" }));
    const media = await options.mediaService.findDerivative(id.data);
    if (!media) return reply.code(404).send(mediaNotFoundResponseSchema.parse({ error: "not_found" }));
    reply.header("x-content-type-options", "nosniff");
    reply.header("cache-control", "public, max-age=31536000, immutable");
    return reply.type(media.mimeType).send(media.stream);
  });
};
