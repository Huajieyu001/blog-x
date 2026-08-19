import { Algorithm, hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { loginInputSchema } from "@blog-x/contracts";
import * as schema from "./schema.js";

type Database = NodePgDatabase<typeof schema>;

export async function seedAdministrator(db: Database, input: unknown) {
  const credentials = loginInputSchema.parse(input);
  const existing = await db.select({ id: schema.administrators.id, username: schema.administrators.username })
    .from(schema.administrators)
    .limit(2);
  if (existing.length > 1 || (existing[0] && existing[0].username !== credentials.username)) {
    throw new Error("a second administrator cannot be seeded");
  }

  const passwordHash = await hash(credentials.password, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  if (existing[0]) {
    await db.update(schema.administrators).set({ passwordHash }).where(eq(schema.administrators.id, existing[0].id));
    return;
  }
  await db.insert(schema.administrators).values({ username: credentials.username, passwordHash });
}

export async function seedAdministratorFromEnvironment(db: Database) {
  return seedAdministrator(db, {
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD,
  });
}
