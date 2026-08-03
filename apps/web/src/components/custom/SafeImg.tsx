import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export interface SafeImgProps {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  title?: string;
  fallback: ReactNode;
}

const RETRY_MARKER = '_rv=1';

/**
 * 图片加载器。代理图片（/api/asset-image）首次解码失败时自动带缓存破坏参数重试一次，
 * 用于自愈历史版本在浏览器/CDN 里留下的损坏缓存条目（旧代理曾以文本方式回传二进制）。
 * 仅对代理路径重试，raw 图（英雄/装备）与失败回退行为不变。
 */
export function SafeImg({ src, alt = '', className, title, fallback }: SafeImgProps) {
  const [error, setError] = useState(false);
  const [retried, setRetried] = useState(false);

  useEffect(() => {
    setError(false);
    setRetried(false);
  }, [src]);

  if (!src || error) {
    return <>{fallback}</>;
  }

  const isProxy = src.includes('/api/asset-image');
  const imgSrc =
    retried && isProxy
      ? `${src}${src.includes('?') ? '&' : '?'}${RETRY_MARKER}`
      : src;

  return (
    <img
      src={imgSrc}
      alt={alt}
      title={title}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => {
        if (isProxy && !retried) {
          setRetried(true);
        } else {
          setError(true);
        }
      }}
    />
  );
}
