import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export interface SafeImgProps {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  fallback: ReactNode;
}

export function SafeImg({ src, alt = '', className, fallback }: SafeImgProps) {
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
  }, [src]);

  if (!src || error) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setError(true)}
    />
  );
}
