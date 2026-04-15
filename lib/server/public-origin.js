const SITE_ORIGIN_FALLBACK = 'https://dotahub.cn';

function firstHeaderValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function cleanHost(value) {
  return String(firstHeaderValue(value) || '')
    .trim()
    .toLowerCase();
}

function normalizeHost(value) {
  return cleanHost(value).replace(/:\d+$/, '');
}

function isInternalEdgeHost(host) {
  return host.endsWith('.qcloudteo.com') || host.includes('pages-scf');
}

function buildOriginFromHost(host, proto) {
  const resolvedProto = String(firstHeaderValue(proto) || 'https').trim() || 'https';
  return `${resolvedProto}://${host}`.replace(/\/+$/, '');
}

export function getPublicOrigin(req) {
  const configured =
    process.env.PUBLIC_SITE_ORIGIN ||
    process.env.VITE_PUBLIC_SITE_ORIGIN ||
    process.env.SITE_URL ||
    '';
  if (configured) return configured.replace(/\/+$/, '');

  const rawForwardedHost = cleanHost(
    req?.headers?.['x-forwarded-host']
      || req?.headers?.['X-Forwarded-Host']
      || req?.headers?.['x-original-host']
      || req?.headers?.['X-Original-Host']
  );
  const forwardedProto = req?.headers?.['x-forwarded-proto'] || req?.headers?.['X-Forwarded-Proto'];
  if (rawForwardedHost && !isInternalEdgeHost(normalizeHost(rawForwardedHost))) {
    return buildOriginFromHost(rawForwardedHost, forwardedProto);
  }

  const rawHost = cleanHost(req?.headers?.host || req?.headers?.Host);
  const normalizedHost = normalizeHost(rawHost);
  if (rawHost && !isInternalEdgeHost(normalizedHost)) {
    const proto = forwardedProto || (/^(localhost|127\.0\.0\.1)$/.test(normalizedHost) ? 'http' : 'https');
    return buildOriginFromHost(rawHost, proto);
  }

  return SITE_ORIGIN_FALLBACK;
}
