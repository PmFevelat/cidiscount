export function Header() {
  return (
    <header
      className="text-white"
      style={{ background: "var(--cds-purple)" }}
    >
      <div className="max-w-[1280px] mx-auto px-4">
        <div className="flex items-center gap-4 py-3">
          <a href="/" className="flex items-center shrink-0" aria-label="Cdiscount">
            <span
              className="block h-11 w-[210px]"
              style={{
                backgroundColor: "white",
                WebkitMaskImage: "url(/cdiscount-logo.svg)",
                maskImage: "url(/cdiscount-logo.svg)",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
                WebkitMaskSize: "contain",
                maskSize: "contain",
                WebkitMaskPosition: "left center",
                maskPosition: "left center",
              }}
              aria-hidden="true"
            />
          </a>

          <div className="flex-1">
            <div className="flex items-center bg-white rounded-full h-10 px-4 shadow-sm">
              <input
                type="text"
                placeholder="Qu'est-ce qui vous ferait plaisir ?"
                className="flex-1 bg-transparent text-[15px] text-gray-700 placeholder-gray-400 outline-none"
              />
              <button
                className="h-8 w-8 rounded-full flex items-center justify-center"
                style={{ background: "var(--cds-red)" }}
                aria-label="Rechercher"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  className="h-4 w-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.5-3.5" />
                </svg>
              </button>
            </div>
          </div>

          <button className="flex items-center gap-2 text-[14px] font-semibold">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 12l2-7h14l2 7M5 12l1 8h12l1-8M8 12V8a4 4 0 018 0v4" />
            </svg>
            Cdiscount à volonté
          </button>

          <button className="flex items-center gap-2 text-[14px] font-semibold">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 22c1.5-4.5 5-6.5 8-6.5s6.5 2 8 6.5" />
            </svg>
            Se connecter
          </button>

          <button className="relative flex items-center gap-2 text-[14px] font-semibold">
            <span
              className="absolute -top-1 left-3 h-4 w-4 text-[10px] font-bold rounded-full flex items-center justify-center text-white"
              style={{ background: "var(--cds-red)" }}
            >
              0
            </span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="9" cy="21" r="1.5" />
              <circle cx="18" cy="21" r="1.5" />
              <path d="M3 4h2l3 12h11l2-8H6" />
            </svg>
            Mon panier
          </button>
        </div>

        <nav className="flex items-center gap-3 pb-3 text-[13px] font-medium">
          <button
            className="flex items-center gap-2 rounded-full border px-3 h-8"
            style={{ borderColor: "rgba(255,255,255,0.6)" }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
            Menu
          </button>
          {[
            "Promo",
            "Jardin",
            "Voyages",
            "Forfait Mobile",
            "Paiement 10x",
            "Assurance Zen",
            "Reconditionné",
            "Programme de fidélité",
          ].map((label) => (
            <a key={label} href="#" className="px-3 h-8 flex items-center">
              {label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
