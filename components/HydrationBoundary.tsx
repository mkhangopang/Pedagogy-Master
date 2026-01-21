'use client';

import React, { useState, useEffect, type ReactNode } from 'react';

/**
 * HYDRATION BOUNDARY
 * Prevents hydration mismatch by ensuring content only renders after client-side hydration.
 */
export default function HydrationBoundary({ 
  children,
  fallback 
}: { 
  children: ReactNode
  fallback?: ReactNode 
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <>{fallback || null}</>;
  }

  return <>{children}</>;
}