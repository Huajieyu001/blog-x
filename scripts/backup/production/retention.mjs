const policyPattern = /^[a-z0-9-]{3,80}$/;

function fail(message) {
  throw new Error(`production retention ${message}`);
}

export async function applySafeRetention({ transport, retentionPolicyId, minimumKnownGood, maximumSets }) {
  if (!transport || typeof transport.catalog !== "function" || typeof transport.deleteCatalogEntry !== "function" || !policyPattern.test(retentionPolicyId ?? "") || !Number.isSafeInteger(minimumKnownGood) || minimumKnownGood < 1 || !Number.isSafeInteger(maximumSets) || maximumSets < minimumKnownGood) fail("policy is invalid");
  const catalog = await transport.catalog();
  if (!Array.isArray(catalog)) fail("catalog is invalid");
  for (const item of catalog) {
    if (!item?.receipt || item.receipt.destinationProfileId !== transport.destinationProfileId || !item.receipt.ciphertextSha256 || !item.receiptSha256) fail("catalog receipt is ambiguous");
  }
  const sorted = [...catalog].sort((left, right) => left.setId.localeCompare(right.setId));
  if (sorted.length < minimumKnownGood) fail("catalog is below the minimum known-good set count");
  const deletions = sorted.slice(0, Math.max(0, sorted.length - maximumSets));
  const deletedSetIds = [];
  for (const entry of deletions) {
    await transport.deleteCatalogEntry(entry);
    deletedSetIds.push(entry.setId);
  }
  return { kept: sorted.length - deletedSetIds.length, deletedSetIds, retentionPolicyId };
}
