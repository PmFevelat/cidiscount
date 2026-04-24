"use client";

import { useEffect, useRef, useState } from "react";

/** Largeur logique (px) : les media queries de la page voient le layout desktop, puis on scale pour remplir la moitié d’écran. */
const DESKTOP_VIEWPORT_WIDTH = 1280;

type Props = {
  src: string;
  title: string;
  fallbackHeight: number;
  sandbox: string;
};

/**
 * Iframe PDP en split : l’intérieur est rendu en largeur « desktop » pour éviter
 * le mode responsive, puis redimensionné pour remplir la colonne.
 */
export function PdpSplitScaledIframe({
  src,
  title,
  fallbackHeight,
  sandbox,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [columnWidth, setColumnWidth] = useState(0);
  const [contentHeight, setContentHeight] = useState(fallbackHeight);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setColumnWidth(el.clientWidth);
    });
    ro.observe(el);
    setColumnWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      try {
        const doc =
          iframe.contentDocument ?? iframe.contentWindow?.document ?? null;
        if (!doc) return;
        const next = Math.max(
          doc.documentElement.scrollHeight,
          doc.body?.scrollHeight ?? 0,
        );
        if (next) {
          setContentHeight((prev) =>
            Math.abs(next - prev) > 4 ? next : prev,
          );
        }
      } catch {
        /* same-origin requis */
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
  }, [src]);

  const w =
    columnWidth > 0
      ? columnWidth
      : typeof document !== "undefined"
        ? Math.max(320, document.documentElement.clientWidth / 2)
        : 800;
  const scale = w / DESKTOP_VIEWPORT_WIDTH;
  const visualHeight = Math.ceil(contentHeight * scale);

  return (
    <div
      ref={containerRef}
      className="h-full min-h-0 min-w-0 w-full overflow-y-auto overflow-x-hidden bg-white"
    >
      <div
        className="relative"
        style={{
          width: w,
          height: visualHeight,
        }}
      >
        <iframe
          ref={iframeRef}
          src={src}
          title={title}
          className="absolute top-0 left-0 m-0 block border-0 p-0"
          style={{
            width: DESKTOP_VIEWPORT_WIDTH,
            height: contentHeight,
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
            background: "#fff",
          }}
          referrerPolicy="no-referrer"
          sandbox={sandbox}
          loading="eager"
        />
      </div>
    </div>
  );
}
