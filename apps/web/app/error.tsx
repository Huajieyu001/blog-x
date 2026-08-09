"use client";

import ServiceUnavailable from "./_components/ServiceUnavailable";

export default function ErrorBoundary({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ServiceUnavailable onRetry={retry} />;
}
