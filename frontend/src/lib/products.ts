import raw from "@/data/images.json";
import redesignRaw from "@/data/redesign-images.json";

type RedesignImage = { order: number; url: string };
const redesignByOrder = new Map<number, string>(
  (redesignRaw as RedesignImage[]).map((r) => [r.order, r.url]),
);

export type RawProduct = {
  global_index: number;
  category_index: number;
  category_name: string;
  category_url: string;
  image_index_in_category: number;
  image_url: string;
  alt: string;
  product_name: string;
  current_price: string;
  old_price: string;
  discount: string;
  rating: string;
  review_count: string;
  shipping_info: string;
  card_text: string;
  top: number;
  left: number;
  product_url: string;
  listing_url: string;
};

export type Product = {
  id: string;
  index: number;
  title: string;
  imageUrl: string;
  redesignImageUrl: string | null;
  productUrl: string;
  priceCurrent: string;
  priceOld: string;
  rating: number | null;
  reviewCount: number | null;
  bullets: string[];
  badge: "meilleur-prix" | "bon-plan" | null;
  sponsored: boolean;
  freeShipping: boolean;
  cdiscountAvolonte: boolean;
  imbattables: boolean;
  moinsCherAmazon: boolean;
  deliveredByCdiscount: boolean;
};

function parseBullets(cardText: string): string[] {
  const keys = [
    "Composition du lot",
    "Nombre et type de jets",
    "Entretien de l'eau",
    "Entretien de l’eau",
    "Dimensions",
    "Volume d'eau",
    "Volume d’eau",
    "Type d'alimentation",
    "Surface nettoyée",
    "Hauteur de la ligne d'eau",
    "Hauteur de la ligne d’eau",
  ];
  const bullets: string[] = [];
  for (const key of keys) {
    const idx = cardText.indexOf(`${key} :`);
    if (idx === -1) continue;
    const after = cardText.slice(idx);
    const match = after.match(
      /^([^:]+?):\s*([^]+?)(?=\s+(?:Composition|Nombre|Entretien|Dimensions|Volume|Type d'|Type d’|Surface|Hauteur|Cdiscount|Livr|Livraison|Prix|Les imbattables|Bon plan|Meilleur prix|Moins cher|Sponsoris|Ajouter|$))/,
    );
    if (match) {
      const label = match[1].trim();
      const value = match[2].trim();
      if (label && value) {
        bullets.push(`${label} : ${value}`);
      }
    }
  }
  return bullets.slice(0, 4);
}

function parseRating(raw: string): number | null {
  if (!raw) return null;
  const v = Number(raw.replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

function parseReviewCount(raw: string): number | null {
  if (!raw) return null;
  const v = Number(raw.replace(/\s/g, ""));
  return Number.isFinite(v) ? v : null;
}

function parseBadge(cardText: string): Product["badge"] {
  if (/Meilleur\s*prix/i.test(cardText)) return "meilleur-prix";
  if (/Bon\s*plan/i.test(cardText)) return "bon-plan";
  return null;
}

function toProduct(item: RawProduct, offset: number): Product {
  const ct = item.card_text || "";
  return {
    id: `${item.global_index}`,
    index: item.image_index_in_category,
    title: item.product_name || item.alt || `Produit ${item.global_index}`,
    imageUrl: item.image_url,
    redesignImageUrl: redesignByOrder.get(item.image_index_in_category) ?? null,
    productUrl: item.product_url,
    priceCurrent: item.current_price || "",
    priceOld:
      item.old_price && item.old_price !== item.current_price
        ? item.old_price
        : "",
    rating: parseRating(item.rating),
    reviewCount: parseReviewCount(item.review_count),
    bullets: parseBullets(ct),
    badge: parseBadge(ct),
    sponsored: /Sponsoris/i.test(ct),
    freeShipping: /Livraison\s+gratuite/i.test(ct),
    cdiscountAvolonte: /Cdiscount\s+à\s+volont/i.test(ct),
    imbattables: /Les\s+imbattables/i.test(ct),
    moinsCherAmazon: /Moins\s+cher\s+qu'?Amazon/i.test(ct),
    deliveredByCdiscount: /Livr[ée]\s+par\s+Cdiscount/i.test(ct),
  };
}

export function getProducts(): Product[] {
  return (raw as RawProduct[]).map(toProduct, 0);
}

export function getCategoryTitle(): string {
  return "Piscines et spa";
}

export function getProductCount(): number {
  return (raw as RawProduct[]).length;
}
