export const searchEncodingHeaderName = "x-blog-x-search-encoding";

const incompletePercentTriplet = /%(?![0-9a-fA-F]{2})/;

function isValidEncodedComponent(component: string) {
  if (incompletePercentTriplet.test(component)) return false;
  try {
    decodeURIComponent(component);
    return true;
  } catch {
    return false;
  }
}

export function validateRawSearchEncoding(rawSearch: string) {
  const source = rawSearch.startsWith("?") ? rawSearch.slice(1) : rawSearch;
  if (!source) return true;
  return source.split("&").every((pair) => {
    const separator = pair.indexOf("=");
    return separator === -1
      ? isValidEncodedComponent(pair)
      : isValidEncodedComponent(pair.slice(0, separator)) && isValidEncodedComponent(pair.slice(separator + 1));
  });
}
