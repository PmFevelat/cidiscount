"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  before: React.ReactNode;
  after: React.ReactNode;
  initial?: number;
};

const INACTIVITY_MS = 3500;

export function BeforeAfterSlider({ before, after, initial = 82 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(initial);
  const [handleX, setHandleX] = useState(0);
  const [hasInteracted, setHasInteracted] = useState(false);
  const dragging = useRef(false);
  const inactivityTimer = useRef<number | null>(null);

  const setFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, pct)));
  }, []);

  useEffect(() => {
    const computeHandleX = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setHandleX(rect.left + (rect.width * pos) / 100);
    };
    computeHandleX();
    window.addEventListener("resize", computeHandleX);
    window.addEventListener("scroll", computeHandleX, { passive: true });
    return () => {
      window.removeEventListener("resize", computeHandleX);
      window.removeEventListener("scroll", computeHandleX);
    };
  }, [pos]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      e.preventDefault();
      setFromClientX(e.clientX);
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [setFromClientX]);

  const markInteracted = () => {
    if (!hasInteracted) setHasInteracted(true);
  };

  // Réarme l'état "teaser" (flou + anneaux + libellé) après inactivité.
  useEffect(() => {
    if (!hasInteracted) return;
    if (inactivityTimer.current) {
      window.clearTimeout(inactivityTimer.current);
    }
    inactivityTimer.current = window.setTimeout(() => {
      setHasInteracted(false);
    }, INACTIVITY_MS);
    return () => {
      if (inactivityTimer.current) {
        window.clearTimeout(inactivityTimer.current);
      }
    };
  }, [hasInteracted, pos]);

  // Le flou s'applique au côté minoritaire (celui qu'on voit le moins).
  // pos >= 50 : original dominant → on floute le redesign (droite).
  // pos <  50 : redesign dominant → on floute l'original (gauche).
  const teaser = !hasInteracted;
  const blurAfter = teaser && pos >= 50;
  const blurBefore = teaser && pos < 50;

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className="w-full"
        style={{
          filter: blurBefore ? "blur(7px) saturate(0.85)" : "blur(0px)",
          transition: "filter 500ms ease",
        }}
      >
        {before}
      </div>

      {/* Voile côté original (quand c'est le redesign qui est dominant) */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-500"
        style={{
          opacity: blurBefore ? 1 : 0,
          clipPath: `inset(0 ${Math.max(0, 100 - pos)}% 0 0)`,
          background:
            "linear-gradient(-90deg, rgba(10,12,30,0.22), rgba(10,12,30,0.08))",
          zIndex: 20,
        }}
      />

      {/* Calque redesign clippé */}
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
        aria-hidden={pos >= 99}
      >
        <div
          style={{
            filter: blurAfter ? "blur(7px) saturate(0.85)" : "blur(0px)",
            transition: "filter 500ms ease",
          }}
        >
          {after}
        </div>

        {/* Voile côté redesign (quand c'est l'original qui est dominant) */}
        <div
          className="absolute inset-0 transition-opacity duration-500 pointer-events-none"
          style={{
            background:
              "linear-gradient(90deg, rgba(10,12,30,0.22), rgba(10,12,30,0.08))",
            opacity: blurAfter ? 1 : 0,
          }}
        />
      </div>

      {/* Ligne verticale — fixée au viewport pour couvrir le footer sticky aussi */}
      <div
        className="fixed top-0 bottom-0 z-[60] pointer-events-none"
        style={{
          left: handleX - 1.5,
          width: 3,
          background:
            "linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(255,255,255,0.92) 100%)",
          boxShadow:
            "0 0 0 1px rgba(0,0,0,0.18), 0 4px 14px rgba(0,0,0,0.18)",
        }}
      />

      {/* Poignée fixée verticalement au centre du viewport */}
      <div
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        aria-label="Comparaison avant / après"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            markInteracted();
            setPos((p) => Math.max(0, p - 3));
          }
          if (e.key === "ArrowRight") {
            markInteracted();
            setPos((p) => Math.min(100, p + 3));
          }
        }}
        onPointerDown={(e) => {
          dragging.current = true;
          markInteracted();
          document.body.style.userSelect = "none";
          document.body.style.cursor = "ew-resize";
          setFromClientX(e.clientX);
        }}
        className="fixed z-[70] cursor-ew-resize select-none"
        style={{
          left: handleX,
          top: "50%",
          transform: "translate(-50%, -50%)",
          touchAction: "none",
        }}
      >
        <div className="relative flex flex-col items-center">
          {/* Anneaux pulsants (invitation à interagir) */}
          {!hasInteracted && (
            <>
              <span
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-16 w-16 rounded-full pointer-events-none"
                style={{
                  animation: "ba-pulse 1.8s ease-out infinite",
                  border: "2px solid rgba(255,255,255,0.9)",
                  boxShadow: "0 0 24px rgba(0,0,0,0.25)",
                }}
              />
              <span
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-16 w-16 rounded-full pointer-events-none"
                style={{
                  animation: "ba-pulse 1.8s ease-out 0.9s infinite",
                  border: "2px solid rgba(255,255,255,0.8)",
                }}
              />
            </>
          )}

          {/* Disque central */}
          <div
            className="relative h-14 w-14 rounded-full flex items-center justify-center transition-transform duration-200 hover:scale-105"
            style={{
              background:
                "linear-gradient(180deg, #ffffff 0%, #f4f4ff 100%)",
              boxShadow:
                "0 10px 24px rgba(0,0,0,0.22), 0 0 0 2px rgba(255,255,255,0.9), inset 0 0 0 1px rgba(0,0,0,0.08)",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="#3a2ff2"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 5L3 12l6 7" />
              <path d="M15 5l6 7-6 7" />
            </svg>
          </div>

          {/* Libellé indicatif tant qu'on n'a pas interagi */}
          {!hasInteracted && (
            <div
              className="absolute top-[74px] whitespace-nowrap text-[12px] font-semibold px-3 py-1 rounded-full shadow-lg pointer-events-none"
              style={{
                background: "#3a2ff2",
                color: "white",
                boxShadow: "0 6px 16px rgba(58,47,242,0.45)",
                animation: "ba-bounce 2s ease-in-out infinite",
              }}
            >
              ← Glissez pour comparer →
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        @keyframes ba-pulse {
          0% {
            transform: translate(-50%, -50%) scale(0.8);
            opacity: 0.9;
          }
          80% {
            transform: translate(-50%, -50%) scale(1.9);
            opacity: 0;
          }
          100% {
            opacity: 0;
          }
        }
        @keyframes ba-bounce {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-4px);
          }
        }
      `}</style>
    </div>
  );
}
