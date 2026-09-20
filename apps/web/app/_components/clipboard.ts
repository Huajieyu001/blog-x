"use client";

export async function copyText(value: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Permission can be unavailable; use the local fallback below.
  }

  if (typeof document === "undefined" || !document.body) return false;

  const fallback = document.createElement("textarea");
  fallback.value = value;
  fallback.readOnly = true;
  fallback.tabIndex = -1;
  fallback.setAttribute("aria-hidden", "true");
  fallback.setAttribute("data-clipboard-fallback", "");
  fallback.style.cssText = "position:fixed;left:-10000px;top:auto;width:1px;height:1px;opacity:0";
  document.body.append(fallback);

  try {
    fallback.select();
    return document.execCommand("copy") === true;
  } catch {
    return false;
  } finally {
    fallback.remove();
  }
}
