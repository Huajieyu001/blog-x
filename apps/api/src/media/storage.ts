import { createReadStream, type ReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const sourceKeyPattern = /^source\/[0-9a-f-]{36}\.bin$/i;
const derivativeKeyPattern = /^derivative\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i;

export class InvalidStorageKeyError extends Error {
  constructor() { super("invalid storage key"); }
}

export interface MediaStorage {
  putSource(key: string, value: Buffer): Promise<void>;
  putDerivative(key: string, value: Buffer): Promise<void>;
  openDerivative(key: string): Promise<Buffer>;
  streamDerivative(key: string): ReadStream;
  removeExact(key: string): Promise<void>;
}

export class LocalMediaStorage implements MediaStorage {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private pathFor(key: string, kind: "source" | "derivative" | "either") {
    const valid = kind === "source"
      ? sourceKeyPattern.test(key)
      : kind === "derivative"
        ? derivativeKeyPattern.test(key)
        : sourceKeyPattern.test(key) || derivativeKeyPattern.test(key);
    if (!valid) throw new InvalidStorageKeyError();
    return join(this.root, key);
  }

  private async atomicWrite(path: string, value: Buffer) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, value, { flag: "wx", mode: 0o600 });
      await rename(temporary, path);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async putSource(key: string, value: Buffer) {
    await this.atomicWrite(this.pathFor(key, "source"), value);
  }

  async putDerivative(key: string, value: Buffer) {
    await this.atomicWrite(this.pathFor(key, "derivative"), value);
  }

  async openDerivative(key: string) {
    return readFile(this.pathFor(key, "derivative"));
  }

  streamDerivative(key: string) {
    return createReadStream(this.pathFor(key, "derivative"));
  }

  async removeExact(key: string) {
    await unlink(this.pathFor(key, "either")).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }

  removeRoot() {
    return rm(this.root, { recursive: true, force: true });
  }
}
