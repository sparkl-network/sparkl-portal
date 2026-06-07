import type {
  FeatureCatalogResponse,
  ProviderListResponse,
} from "@/lib/router/types";

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    /* keep raw */
  }
  if (!res.ok) {
    const err =
      typeof parsed === "object" &&
      parsed !== null &&
      "error" in parsed &&
      typeof (parsed as { error: unknown }).error === "string"
        ? (parsed as { error: string }).error
        : `Router catalog request failed (${res.status})`;
    throw new Error(err);
  }
  return parsed as T;
}

export type FetchProvidersOptions = {
  onlineOnly?: boolean;
  model?: string;
};

export async function fetchRouterProviders(
  options: FetchProvidersOptions = {},
): Promise<ProviderListResponse> {
  const params = new URLSearchParams();
  params.set("online_only", options.onlineOnly === true ? "true" : "false");
  if (options.model) params.set("model", options.model);
  const qs = params.toString();
  const res = await fetch(`/api/router-catalog/providers?${qs}`, { cache: "no-store" });
  return parseJson<ProviderListResponse>(res);
}

export async function fetchRouterFeatureCatalog(): Promise<FeatureCatalogResponse> {
  const res = await fetch("/api/router-catalog/features", { cache: "no-store" });
  return parseJson<FeatureCatalogResponse>(res);
}
