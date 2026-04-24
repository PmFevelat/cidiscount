"use client";

type Props = {
  title?: string;
  lines: string[];
  error: string | null;
  className?: string;
  maxHeightClass?: string;
};

export function ScraperLogBlock({
  title = "Journal d'exécution",
  lines,
  error,
  className = "",
  maxHeightClass = "max-h-40",
}: Props) {
  if (!lines.length && !error) return null;
  return (
    <div className={className}>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </p>
      <div
        className={`${maxHeightClass} overflow-y-auto rounded-lg bg-gray-900 px-3 py-2 font-mono text-[11px] leading-relaxed text-gray-100`}
      >
        {lines.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap">
            {line}
          </div>
        ))}
        {error && <div className="text-red-300">✗ {error}</div>}
      </div>
    </div>
  );
}
