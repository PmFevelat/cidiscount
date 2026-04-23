"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  src: string;
  title: string;
  fallbackHeight: number;
};

/**
 * Iframe that mirrors the captured page pixel-perfectly.
 *
 * - `pointer-events: none` so the before/after slider always receives drags.
 * - Auto-resizes to its document's scrollHeight whenever we can read it.
 *   Works when the iframe is same-origin (our /snapshots/* files are served
 *   from the Next.js app itself, so we always have same-origin access).
 */
export function SnapshotFrame({ src, title, fallbackHeight }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number>(fallbackHeight);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      try {
        const doc =
          iframe.contentDocument ??
          iframe.contentWindow?.document ??
          null;
        if (!doc) return;
        const next = Math.max(
          doc.documentElement.scrollHeight,
          doc.body?.scrollHeight ?? 0,
        );
        if (next && Math.abs(next - height) > 4) {
          setHeight(next);
        }
      } catch {
        /* cross-origin — keep fallback */
      }
    };

    const onLoad = () => {
      measure();
      const id = window.setInterval(measure, 600);
      window.setTimeout(() => window.clearInterval(id), 6000);
    };

    iframe.addEventListener("load", onLoad);
    if (iframe.contentDocument?.readyState === "complete") {
      onLoad();
    }
    return () => {
      cancelled = true;
      iframe.removeEventListener("load", onLoad);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title={title}
      className="block w-full border-0"
      style={{
        height,
        pointerEvents: "none",
        background: "#fff",
      }}
      sandbox="allow-same-origin"
      loading="eager"
    />
  );
}
