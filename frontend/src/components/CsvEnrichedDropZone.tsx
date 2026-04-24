"use client";

import { useCallback, useRef, useState } from "react";

type Props = {
  inputId: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
  helpText?: React.ReactNode;
};

/**
 * Zone vide explicite pour le CSV enrichi (pas le natif « Choose file » seul).
 */
export function CsvEnrichedDropZone({
  inputId,
  file,
  onFileChange,
  disabled = false,
  helpText,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const pick = useCallback(
    (f: File | null) => {
      if (!f) {
        onFileChange(null);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      if (f.name.toLowerCase().endsWith(".csv") || f.type === "text/csv") {
        onFileChange(f);
      }
    },
    [onFileChange],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        tabIndex={-1}
        disabled={disabled}
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          if (disabled) return;
          const f = e.dataTransfer.files?.[0];
          if (f) pick(f);
        }}
        className={[
          "group flex min-h-[140px] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition",
          disabled
            ? "cursor-not-allowed border-gray-200 bg-gray-100 opacity-60"
            : dragOver
              ? "cursor-pointer border-[#3a2ff2] bg-indigo-50/90"
              : "cursor-pointer border-gray-300 bg-gray-50/90 hover:border-[#3a2ff2]/50 hover:bg-indigo-50/40",
        ].join(" ")}
      >
        {file ? (
          <>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-100 text-[#3a2ff2]">
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M9 12l2 2 4-4" />
                <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c1.5 0 2.9.37 4.14 1.02" />
              </svg>
            </div>
            <p className="mt-2 max-w-full truncate px-2 text-[13px] font-semibold text-gray-900">
              {file.name}
            </p>
            <p className="mt-0.5 text-[12px] text-gray-500">
              Clique pour remplacer le fichier
            </p>
          </>
        ) : (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 group-hover:border-[#3a2ff2]/30 group-hover:text-[#3a2ff2]">
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="mt-3 text-[13px] font-medium text-gray-700">
              Aucun fichier sélectionné
            </p>
            <p className="mt-1 max-w-[280px] text-[12px] leading-snug text-gray-500">
              Glisse ici ton CSV enrichi, ou clique pour parcourir (fichier
              .csv)
            </p>
          </>
        )}
      </button>
      {helpText && (
        <span className="text-[11px] text-gray-400">{helpText}</span>
      )}
    </div>
  );
}
