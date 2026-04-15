export const ASSET_IMAGE_PROXY_PATH: string;

export function normalizeAssetProxySourceUrl(rawUrl: string | null | undefined, baseUrl?: string): string | null;

export function isSupportedAssetImageUrl(rawUrl: string | null | undefined, baseUrl?: string): boolean;

export function rebaseAssetImageProxyUrl(
  rawUrl: string | null | undefined,
  options?: {
    baseUrl?: string;
    publicOrigin?: string;
  }
): string | null;

export function toChinaReachableAssetUrl(
  rawUrl: string | null | undefined,
  options?: {
    baseUrl?: string;
    publicOrigin?: string;
  }
): string | null;

export function getAssetImageFetchCandidates(rawUrl: string | null | undefined, baseUrl?: string): string[];
