export function PromoBanner() {
  return (
    <div
      className="rounded-lg overflow-hidden flex items-center justify-between px-6 py-5"
      style={{ background: "#fde0bf" }}
    >
      <div className="flex items-center gap-8">
        <div
          className="font-extrabold leading-none"
          style={{ color: "var(--cds-purple)", fontSize: 28 }}
        >
          NOUVEAU
          <br />
          CLIENT ?
        </div>
        <div className="leading-tight">
          <div
            className="font-extrabold"
            style={{ color: "var(--cds-red)", fontSize: 30 }}
          >
            10€ OFFERTS
          </div>
          <div
            className="font-bold text-[13px]"
            style={{ color: "var(--cds-purple)" }}
          >
            dès 50€ d&apos;achat
          </div>
          <div className="text-[11px] text-gray-700">
            pour votre première commande
          </div>
        </div>
      </div>
      <div className="text-right">
        <button
          className="rounded-full text-white font-semibold px-5 h-10"
          style={{ background: "var(--cds-purple)" }}
        >
          Obtenir le code
        </button>
        <div className="text-[11px] mt-1 text-gray-700">*Voir conditions</div>
      </div>
    </div>
  );
}

export function StickyPromoBar() {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 text-white text-[13px] px-4 py-3 flex items-center justify-center gap-2"
      style={{ background: "var(--cds-red)" }}
    >
      <span className="font-semibold">
        -10€ dès 50€ d&apos;achat*
      </span>
      <span>pour toute 1ère commande. </span>
      <a href="#" className="underline font-semibold">
        Cliquez ici pour obtenir votre code.
      </a>
      <span>*Voir conditions</span>
      <button
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white"
        aria-label="Fermer"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
