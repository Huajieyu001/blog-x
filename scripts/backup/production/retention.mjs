const policyPattern = /^[a-z0-9-]{3,80}$/;

function fail(message) {
  throw new Error(`production retention ${message}`);
}

export async function applySafeRetention({ transport, retentionPolicyId, minimumKnownGood }) {
  if (!transport || typeof transport.catalog !== "function" || typeof transport.deleteCatalogEntry !== "function" || !policyPattern.test(retentionPolicyId ?? "") || !Number.isSafeInteger(minimumKnownGood) || minimumKnownGood < 1) fail("policy is invalid");
  const catalog = await transport.catalog();
  if (!Array.isArray(catalog)) fail("catalog is invalid");
  for (const item of catalog) {
    if (!item?.receipt || item.receipt.destinationProfileId !== transport.destinationProfileId || !item.receipt.ciphertextSha256 || !item.receiptSha256) fail("catalog receipt is ambiguous");
  }
  const sorted = [...catalog].sort((left, right) => left.setId.localeCompare(right.setId));
  const deletions = sorted.slice(0, Math.max(0, sorted.length - minimumKnownGood));
  for (const entry of deletions) await transport.deleteCatalogEntry(entry);
  return { kept: sorted.length - deletions.length, deletedSetIds: deletions.map((entry) => entry.setId), retentionPolicyId };
}
