import { createHash } from "node:crypto";

export function createGeneratedFakeTransport({ failAt } = {}) {
  const records = [];
  const fail = (stage) => {
    if (failAt === stage) throw new Error(`generated fake transport ${stage} fault`);
  };
  return {
    scope: "generated-fake",
    destinationProfileId: "blog-x-mounted-directory-v1",
    async transfer(input) {
      fail("transfer");
      fail("receipt");
      const receipt = {
        format: "blog-x-backup-receipt", version: 1, setId: input.setId, manifestSha256: input.manifestSha256,
        ciphertextSha256: input.ciphertextSha256, aadSha256: input.aadSha256, createdAt: input.createdAt,
        destinationProfileId: "blog-x-mounted-directory-v1",
      };
      const record = { setId: input.setId, receipt, receiptSha256: createHash("sha256").update(JSON.stringify(receipt)).digest("hex"), cipherPath: `fake:${input.setId}`, receiptPath: `fake:${input.setId}` };
      records.push(record);
      return { ...receipt, receiptSha256: record.receiptSha256 };
    },
    async catalog() { fail("catalog"); return records.map((record) => ({ ...record })); },
    async deleteCatalogEntry(entry) { fail("retention"); const index = records.findIndex((record) => record.setId === entry.setId); if (index >= 0) records.splice(index, 1); },
  };
}
