import type { ReactNode } from "react";

type Props = {
  left: ReactNode;
  right: ReactNode;
};

/**
 * Deux volets 50/50 + séparateur visible (ligne + pastille « VS ») reprenant le
 * langage visuel du before/after slider, sans glissière interactive.
 */
export function PdpSplitScreen({ left, right }: Props) {
  return (
    <section
      className="relative h-full min-h-0 w-full"
      aria-label="Comparaison côte à côte : original à gauche, redesign à droite"
    >
      <div className="flex h-full min-h-0 w-full">
        <div className="flex h-full min-h-0 min-w-0 w-1/2 flex-col">
          {left}
        </div>
        <div className="flex h-full min-h-0 min-w-0 w-1/2 flex-col">
          {right}
        </div>
      </div>

      {/* Ligne centrale (même principe que BeforeAfterSlider) */}
      <div
        className="pointer-events-none absolute inset-y-0 left-1/2 z-[65] w-0 -translate-x-1/2"
        aria-hidden
      >
        <div
          className="absolute top-0 bottom-0 left-1/2 w-[3px] -translate-x-1/2"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(250,250,255,1) 50%, rgba(255,255,255,1) 100%)",
            boxShadow:
              "0 0 0 1px rgba(0,0,0,0.2), 0 4px 16px rgba(0,0,0,0.2), 0 0 32px rgba(0,0,0,0.1)",
          }}
        />
      </div>

      {/* Pastille VS (remplace l’icône chevrons du slider) */}
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 z-[70] -translate-x-1/2 -translate-y-1/2"
        aria-hidden
      >
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full text-[15px] font-extrabold tracking-wide text-[#3a2ff2]"
          style={{
            background: "linear-gradient(180deg, #ffffff 0%, #f4f4ff 100%)",
            boxShadow:
              "0 10px 24px rgba(0,0,0,0.22), 0 0 0 2px rgba(255,255,255,0.9), inset 0 0 0 1px rgba(0,0,0,0.08)",
          }}
        >
          VS
        </div>
      </div>
    </section>
  );
}
