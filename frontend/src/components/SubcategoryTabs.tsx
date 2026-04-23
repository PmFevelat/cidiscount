const tabs = [
  "Piscine",
  "Pompe - filtration",
  "Bâche - couverture",
  "Douche extérieure",
  "Chauffage de piscine",
  "Coque - liner",
  "Entretien de piscine",
  "Alarme - détection",
];

export function SubcategoryTabs() {
  return (
    <div className="flex items-center gap-2 overflow-x-auto py-3">
      {tabs.map((label) => (
        <button
          key={label}
          className="h-9 rounded-full border px-4 text-[13px] font-medium whitespace-nowrap bg-white hover:border-gray-400"
          style={{ borderColor: "var(--cds-border)" }}
        >
          {label}
        </button>
      ))}
      <button
        className="h-9 w-9 rounded-full border flex items-center justify-center shrink-0 bg-white"
        style={{ borderColor: "var(--cds-border)" }}
        aria-label="Plus de catégories"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className="h-4 w-4 text-gray-600"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}

export function ListingHeader({ count }: { count: number }) {
  return (
    <div className="flex items-center justify-between py-2 text-[13px]">
      <div className="font-semibold">{count} produits</div>
      <div className="flex items-center gap-2 text-gray-700">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4l3 2" />
        </svg>
        <span>Trier par :</span>
        <button className="font-semibold flex items-center gap-1">
          Meilleures ventes
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function InlineSearch({ count }: { count: number }) {
  return (
    <div
      className="flex items-center gap-2 rounded-full border h-10 px-4 my-3"
      style={{ borderColor: "var(--cds-border)", background: "white" }}
    >
      <input
        className="flex-1 bg-transparent outline-none text-[14px] placeholder-gray-500"
        placeholder={`Chercher parmi les ${count} produits`}
      />
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        className="h-4 w-4 text-gray-500"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
    </div>
  );
}
