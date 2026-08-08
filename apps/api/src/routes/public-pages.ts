import { archiveSchema, publicAboutSchema } from "@blog-x/contracts";
import type { FastifyPluginAsync } from "fastify";
import { renderMarkdown } from "../content/markdown.js";
import type { PageRepository } from "../content/page-repository.js";
export const publicPageRoutes: FastifyPluginAsync<{ pageRepository:PageRepository }> = async (app, options) => { app.get("/public/archives", async()=>archiveSchema.parse({years:await options.pageRepository.archive()})); app.get("/public/about",async(_request,reply)=>{const row=(await options.pageRepository.about())[0];if(!row||row.status!=="published")return reply.code(404).send({error:"not_found"});return publicAboutSchema.parse({title:row.title,renderedHtml:(await renderMarkdown(row.markdown)).html,updatedAt:row.updatedAt.toISOString()});}); };
