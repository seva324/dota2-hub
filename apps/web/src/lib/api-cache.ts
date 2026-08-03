/**
 * 共享 fetch 缓存 + single-flight。
 *
 * 首页与比赛页加载同一批数据（/api/live-hero、/api/upcoming、/api/matches）。
 * 两个页面是条件渲染的兄弟组件：切换页面 = 旧组件卸载 + 新组件重新拉取。
 * 这个模块在组件之外保留一份 payload 级缓存，让导航回来时 0 网络请求。
 *
 * 规则：
 *  - 同 URL 并发请求 → single-flight，共享同一次在途 fetch。
 *  - TTL 内命中 → 直接返回缓存，不发请求。
 *  - bypass（实时数据，如 live-hero 30s 轮询）→ 只做并发去重，不缓存。
 *  - 网络失败 → 不写缓存，下次重试。
 */

const DEFAULT_TTL_MS = 60_000;

interface CacheEntry {
  payload: unknown;
  at: number;
}

/** 正在途的 fetch 按 URL 去重。 */
const inflight = new Map<string, Promise<unknown>>();
/** 成功的 payload 按 URL 缓存。 */
const store = new Map<string, CacheEntry>();

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** 空结果判定：空数组 / 空对象 / { upcoming: [], teams: [] } 这类空容器。 */
function isEmptyPayload(payload: unknown): boolean {
  if (Array.isArray(payload)) return payload.length === 0;
  if (payload && typeof payload === 'object') {
    const values = Object.values(payload as Record<string, unknown>);
    if (values.length === 0) return true;
    return values.every((v) => Array.isArray(v) && v.length === 0);
  }
  return false;
}

/**
 * 带共享缓存的 fetch。
 * @param url 请求 URL（作为缓存键的一部分）
 * @param options.ttlMs 缓存有效期；默认 60s。传 0 表示不缓存（只做并发去重）。
 * @param options.cacheEmpty 空结果（空数组）是否写入缓存；默认 true。
 *   抓取失败返回空时前端缓存会把空数据顶住 60s，传 false 让空结果直接穿透重试。
 * @param options.fetchImpl 测试注入
 */
export async function apiFetch<T = unknown>(
  url: string,
  options: { ttlMs?: number; cacheEmpty?: boolean; fetchImpl?: FetchLike; signal?: AbortSignal } = {},
): Promise<T> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const cacheable = ttlMs > 0;

  const now = Date.now();
  const cached = store.get(url);
  if (cacheable && cached && now - cached.at < ttlMs) {
    return cached.payload as T;
  }

  const existing = inflight.get(url);
  if (existing) {
    return existing as Promise<T>;
  }

  const task = (async () => {
    const res = options.signal ? await fetchImpl(url, { signal: options.signal }) : await fetchImpl(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const payload = (await res.json()) as T;
    if (cacheable && (options.cacheEmpty !== false || !isEmptyPayload(payload))) {
      store.set(url, { payload, at: Date.now() });
    }
    return payload;
  })().catch((error) => {
    // 失败不缓存，也清掉在途标记（finally 已清），下次重试。
    throw error;
  });

  inflight.set(url, task);
  try {
    return (await task) as T;
  } finally {
    inflight.delete(url);
  }
}

/** 测试用：清空缓存与在途请求，避免跨测试串数据。 */
export function __resetApiCache(): void {
  inflight.clear();
  store.clear();
}
