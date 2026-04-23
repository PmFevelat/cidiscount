import type { Product } from "@/lib/products";

function Stars({ value }: { value: number }) {
  const rounded = Math.round(value);
  return (
    <div className="flex items-center gap-0.5" aria-label={`Note ${value}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill={i <= rounded ? "#ffb400" : "#e5e5e5"}
        >
          <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
        </svg>
      ))}
    </div>
  );
}

function Badge({ kind }: { kind: "meilleur-prix" | "bon-plan" }) {
  if (kind === "meilleur-prix") {
    return (
      <span
        className="inline-block text-white text-[12px] font-bold uppercase px-2 py-1 rounded-sm"
        style={{ background: "var(--cds-red)" }}
      >
        Meilleur prix
      </span>
    );
  }
  return (
    <span
      className="inline-block text-white text-[12px] font-bold uppercase px-2 py-1 rounded-sm"
      style={{ background: "#2c66bd" }}
    >
      Bon plan
    </span>
  );
}

function TruckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 inline-block mr-1 align-[-2px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
      <circle cx="7" cy="18" r="1.6" />
      <circle cx="17" cy="18" r="1.6" />
    </svg>
  );
}

export function ProductCard({
  product,
  mode = "original",
}: {
  product: Product;
  mode?: "original" | "redesign";
}) {
  const isRedesign = mode === "redesign";
  const displayImageUrl = isRedesign
    ? product.redesignImageUrl
    : product.imageUrl;
  const usePlaceholder = isRedesign && !displayImageUrl;
  return (
    <article
      className="bg-white rounded-md border px-4 py-4 grid gap-4"
      style={{
        borderColor: "var(--cds-border)",
        gridTemplateColumns: "180px 1fr 220px",
      }}
    >
      <div className="flex flex-col items-start gap-2">
        <div className="relative w-[180px] h-[180px] flex items-center justify-center bg-white">
          {product.badge && (
            <div className="absolute top-1 left-1 z-10">
              <Badge kind={product.badge} />
            </div>
          )}
          {usePlaceholder ? (
            <div
              className="h-[180px] w-[180px] rounded-md flex items-center justify-center"
              style={{ background: "#d9d9d9" }}
              aria-label="Image à venir"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-10 w-10 text-gray-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <circle cx="9" cy="10" r="2" />
                <path d="M21 16l-5-5-8 8" />
              </svg>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayImageUrl ?? product.imageUrl}
              alt={product.title}
              className="max-h-[180px] max-w-[180px] object-contain"
            />
          )}
        </div>
        {product.sponsored && (
          <div className="flex items-center gap-1 text-[11px] text-gray-500">
            Sponsorisé
            <span className="inline-flex items-center justify-center h-3 w-3 rounded-full border text-[9px]">
              ?
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 pt-1">
        <h3 className="text-[15px] leading-snug font-semibold text-[#1e2a44] hover:underline cursor-pointer line-clamp-2">
          {product.title}
        </h3>

        <div className="flex items-center gap-2 text-[12px] text-gray-600">
          {product.rating !== null && <Stars value={product.rating} />}
          {product.rating !== null && (
            <span>{product.rating.toFixed(1).replace(".", ",")} / 5</span>
          )}
          {product.reviewCount !== null && (
            <span>{product.reviewCount} avis</span>
          )}
        </div>

        {product.bullets.length > 0 && (
          <ul className="mt-1 space-y-1">
            {product.bullets.map((b) => (
              <li
                key={b}
                className="text-[13px] text-gray-700 pl-3 relative before:content-[''] before:absolute before:left-0 before:top-2 before:h-1 before:w-1 before:rounded-full before:bg-gray-500"
              >
                {b}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-1 flex items-center gap-4 text-[12px]">
          {product.cdiscountAvolonte && (
            <span
              className="font-semibold"
              style={{ color: "var(--cds-purple)" }}
            >
              Cdiscount <span style={{ color: "var(--cds-red)" }}>à volonté</span>
            </span>
          )}
          {product.freeShipping && (
            <span className="text-gray-700">
              <TruckIcon />
              Livraison gratuite<sup>1</sup>
            </span>
          )}
          {product.deliveredByCdiscount && (
            <span className="text-gray-700">
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 inline-block mr-1 align-[-2px]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 7h13v10H3zM16 11h4l1 3v3h-5z" />
              </svg>
              Livré par Cdiscount
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end justify-between text-right gap-2">
        <div className="flex flex-col items-end gap-1">
          {product.moinsCherAmazon && (
            <span
              className="text-[12px] font-semibold px-2 py-1 rounded-md"
              style={{
                background: "var(--cds-pink)",
                color: "var(--cds-red)",
              }}
            >
              ↘ Moins cher qu&apos;Amazon.fr{" "}
              <span className="inline-flex items-center justify-center h-3 w-3 rounded-full border text-[9px]">
                ?
              </span>
            </span>
          )}
          {product.imbattables && (
            <span
              className="text-[12px] font-semibold"
              style={{ color: "#2c66bd" }}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 inline-block mr-1 align-[-2px]"
                fill="currentColor"
              >
                <path d="M12 2l3 6 6 1-4.5 4.3 1.1 6.7L12 17l-5.6 3 1.1-6.7L3 9l6-1z" />
              </svg>
              Les imbattables
            </span>
          )}
        </div>

        <div>
          {product.priceOld && (
            <div className="text-[13px] text-gray-500">
              Prix de comparaison
              <div className="line-through">{product.priceOld}</div>
            </div>
          )}
          <div
            className="font-extrabold text-[22px]"
            style={{ color: "var(--cds-red)" }}
          >
            {product.priceCurrent || "—"}
          </div>
        </div>

        <button
          className="h-10 w-full rounded-full border-2 font-semibold text-[14px] hover:bg-[#f5f0ff]"
          style={{
            borderColor: "var(--cds-purple)",
            color: "var(--cds-purple)",
          }}
        >
          Ajouter
        </button>
      </div>
    </article>
  );
}
