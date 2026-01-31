// runtime config loader (fetches from Cloudflare Worker)
let cachedConfig = null;

export async function loadRuntimeConfig() {
  if (cachedConfig) return cachedConfig;

  const configUrl =
    import.meta.env.VITE_CONFIG_URL ||
    "https://bracelets-ssl-grove-cloth.trycloudflare.com";

  try {
    const res = await fetch(configUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`config fetch failed: ${res.status}`);
    const json = await res.json();
    cachedConfig = json && typeof json === "object" ? json : null;
  } catch (e) {
    cachedConfig = null;
  }

  return cachedConfig;
}

export function getApiBaseFallback() {
  return (
    import.meta.env.VITE_API_URL ||
    "https://hospital-minor-living-goes.trycloudflare.com/api"
  );
}
