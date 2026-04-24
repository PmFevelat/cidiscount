"use client";

import { useCallback, useEffect, useState } from "react";

interface Props {
  originalImages: string[];
  redesignImages: string[];
  title: string;
}

export function PdpGallery({ originalImages, redesignImages, title }: Props) {
  const [idx, setIdx] = useState(0);
  const count = originalImages.length;

  const prev = useCallback(
    () => setIdx((i) => (i - 1 + count) % count),
    [count],
  );
  const next = useCallback(() => setIdx((i) => (i + 1) % count), [count]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next]);

  const originalSrc = originalImages[idx];
  const redesignSrc = redesignImages[idx];

  return (
    <div
      className="flex flex-col h-[100dvh] bg-neutral-950 select-none"
      aria-label={title}
    >
      {/* Main panels */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <ImagePanel
          label="ORIGINAL"
          src={originalSrc}
          onPrev={prev}
          onNext={next}
        />
        <div className="w-px flex-shrink-0 bg-neutral-700" />
        <ImagePanel
          label="REDESIGN"
          src={redesignSrc || undefined}
          placeholder={!redesignSrc}
          onPrev={prev}
          onNext={next}
        />
      </div>

      {/* Shared thumbnail strip */}
      <div className="flex-shrink-0 bg-neutral-900 border-t border-neutral-800">
        <div className="flex items-center gap-3 px-4 py-3">
          <NavArrow direction="prev" onClick={prev} />
          <div className="flex gap-2 overflow-x-auto flex-1 [&::-webkit-scrollbar]:hidden">
            {originalImages.map((src, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className={`flex-shrink-0 w-14 h-14 rounded overflow-hidden border-2 transition-all ${
                  i === idx
                    ? "border-white"
                    : "border-transparent opacity-40 hover:opacity-70"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Vue ${i + 1}`}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </button>
            ))}
          </div>
          <NavArrow direction="next" onClick={next} />
          <span className="flex-shrink-0 text-[11px] text-neutral-500 tabular-nums w-10 text-right">
            {idx + 1}&thinsp;/&thinsp;{count}
          </span>
        </div>
      </div>
    </div>
  );
}

function ImagePanel({
  label,
  src,
  placeholder,
  onPrev,
  onNext,
}: {
  label: string;
  src?: string;
  placeholder?: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
      {/* Column label */}
      <div className="flex-shrink-0 py-2 text-center bg-neutral-900 border-b border-neutral-800">
        <span className="text-[10px] font-semibold tracking-[0.18em] text-neutral-400 uppercase">
          {label}
        </span>
      </div>

      {/* Image area */}
      <div className="relative flex-1 flex items-center justify-center min-h-0 bg-neutral-950 group">
        {placeholder ? (
          <div className="w-full h-full flex items-center justify-center p-6">
            <div className="w-full h-full max-w-full max-h-full rounded bg-neutral-700/60" />
          </div>
        ) : src ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={src}
            alt={label}
            className="max-w-full max-h-full object-contain p-6"
            draggable={false}
          />
        ) : null}

        {/* Prev / Next overlays */}
        {!placeholder && (
          <>
            <button
              onClick={onPrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/80 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Image précédente"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              onClick={onNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/80 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Image suivante"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function NavArrow({
  direction,
  onClick,
}: {
  direction: "prev" | "next";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 w-7 h-7 rounded-full bg-neutral-700 hover:bg-neutral-600 flex items-center justify-center text-white transition-colors"
      aria-label={direction === "prev" ? "Précédent" : "Suivant"}
    >
      <svg
        viewBox="0 0 24 24"
        className="w-3.5 h-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {direction === "prev" ? (
          <path d="M15 18l-6-6 6-6" />
        ) : (
          <path d="M9 18l6-6-6-6" />
        )}
      </svg>
    </button>
  );
}
