import type { MediaMimeType } from "@blog-x/contracts";
import sharp from "sharp";

const maximumSourceBytes = 5 * 1024 * 1024;
const maximumPixels = 40_000_000;
const maximumDimension = 20_000;

export class InvalidMediaError extends Error {
  constructor() { super("invalid media"); }
}

const formats: Record<MediaMimeType, { format: "jpeg" | "png" | "webp"; extension: "jpg" | "png" | "webp" }> = {
  "image/jpeg": { format: "jpeg", extension: "jpg" },
  "image/png": { format: "png", extension: "png" },
  "image/webp": { format: "webp", extension: "webp" },
};

function detectedMime(input: Buffer): MediaMimeType | null {
  if (input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) return "image/jpeg";
  if (input.length >= 8 && input.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (input.length >= 12 && input.subarray(0, 4).toString("ascii") === "RIFF" && input.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

let processingTail = Promise.resolve();
async function serial<T>(operation: () => Promise<T>) {
  const previous = processingTail;
  let release!: () => void;
  processingTail = new Promise<void>((accept) => { release = accept; });
  await previous;
  try { return await operation(); } finally { release(); }
}

export type ProcessedMedia = {
  derivative: Buffer;
  mimeType: MediaMimeType;
  extension: "jpg" | "png" | "webp";
  width: number;
  height: number;
};

export async function processMedia(source: Buffer, declaredMime: string): Promise<ProcessedMedia> {
  if (source.length === 0 || source.length > maximumSourceBytes) throw new InvalidMediaError();
  if (!(declaredMime in formats)) throw new InvalidMediaError();
  const mime = detectedMime(source);
  if (!mime || mime !== declaredMime) throw new InvalidMediaError();

  return serial(async () => {
    try {
      const decoder = sharp(source, { animated: true, failOn: "error", limitInputPixels: maximumPixels, sequentialRead: true });
      const metadata = await decoder.metadata();
      if (!metadata.width || !metadata.height || metadata.width > maximumDimension || metadata.height > maximumDimension) throw new InvalidMediaError();
      if ((metadata.pages ?? 1) !== 1) throw new InvalidMediaError();
      if (metadata.format !== formats[mime].format) throw new InvalidMediaError();
      const transformed = decoder.rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true });
      const encoded = mime === "image/jpeg"
        ? transformed.jpeg({ quality: 85, mozjpeg: true })
        : mime === "image/png"
          ? transformed.png({ compressionLevel: 9 })
          : transformed.webp({ quality: 82 });
      const result = await encoded.toBuffer({ resolveWithObject: true });
      if (!result.info.width || !result.info.height || result.info.width > 2400 || result.info.height > 2400) throw new InvalidMediaError();
      return {
        derivative: result.data,
        mimeType: mime,
        extension: formats[mime].extension,
        width: result.info.width,
        height: result.info.height,
      };
    } catch (error) {
      if (error instanceof InvalidMediaError) throw error;
      throw new InvalidMediaError();
    }
  });
}
