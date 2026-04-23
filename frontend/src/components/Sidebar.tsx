type SidebarSection = {
  title: string;
  collapsible?: boolean;
  items?: { label: string; count?: number; highlight?: boolean }[];
  hasSearch?: boolean;
  extra?: React.ReactNode;
};

const sections: SidebarSection[] = [
  {
    title: "Catégorie",
    collapsible: true,
    items: [
      { label: "Jardin - piscine", count: 304 },
      { label: "Jeux - jouets", count: 25 },
    ],
  },
  {
    title: "Livraison",
    collapsible: true,
    items: [
      { label: "Cdiscount à volonté", count: 95, highlight: true },
      { label: "Expédié par cdiscount", count: 163 },
      { label: "Livraison express", count: 69 },
      { label: "Livraison gratuite", count: 215 },
    ],
  },
  {
    title: "Prix",
    collapsible: true,
    items: [
      { label: "10 à 20€" },
      { label: "20 à 50€" },
      { label: "50 à 100€" },
      { label: "100 à 200€" },
      { label: "200 à 500€" },
      { label: "500 à 1000€" },
      { label: "1000€ et +" },
    ],
  },
  {
    title: "Marque",
    collapsible: true,
    hasSearch: true,
    items: [
      { label: "Aiper", count: 1 },
      { label: "Airobo", count: 4 },
      { label: "Allspares", count: 1 },
      { label: "Aqualux", count: 2 },
      { label: "Arebos", count: 6 },
    ],
    extra: (
      <a
        className="text-[13px] font-semibold mt-1 inline-block"
        style={{ color: "var(--cds-link)" }}
        href="#"
      >
        Afficher plus (75)
      </a>
    ),
  },
  { title: "Couleur", collapsible: true },
  { title: "Vendeur", collapsible: true },
  { title: "Avis clients", collapsible: true },
];

function Section({ section }: { section: SidebarSection }) {
  return (
    <div className="border-b last:border-b-0" style={{ borderColor: "var(--cds-border)" }}>
      <button className="w-full flex items-center justify-between py-3 font-bold text-[14px]">
        <span>{section.title}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className="h-4 w-4 text-gray-600"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {section.hasSearch && (
        <div className="mb-3">
          <div
            className="flex items-center gap-2 rounded-full border h-9 px-3"
            style={{ borderColor: "var(--cds-border)" }}
          >
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
            <input
              className="flex-1 bg-transparent outline-none text-[13px]"
              placeholder="Rechercher une marque"
            />
          </div>
        </div>
      )}

      {section.items && (
        <ul className="pb-3 space-y-2">
          {section.items.map((it) => (
            <li key={it.label} className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" className="h-4 w-4 rounded" />
                <span>
                  {it.label}
                  {typeof it.count === "number" && (
                    <span
                      className={`ml-1 ${
                        it.highlight ? "font-bold" : "text-gray-500"
                      }`}
                      style={it.highlight ? { color: "var(--cds-link)" } : {}}
                    >
                      ({it.count})
                    </span>
                  )}
                </span>
              </label>
              {section.title === "Catégorie" && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  className="h-4 w-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              )}
            </li>
          ))}
          {section.extra && <li>{section.extra}</li>}
        </ul>
      )}
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="w-[240px] shrink-0">
      <h2 className="font-bold text-[15px] mb-2">Filtres</h2>
      <div className="bg-white rounded-md px-3">
        {sections.map((s) => (
          <Section key={s.title} section={s} />
        ))}
      </div>
    </aside>
  );
}
