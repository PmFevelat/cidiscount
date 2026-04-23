import { Header } from "./Header";
import { PromoBanner, StickyPromoBar } from "./PromoBanner";
import { Sidebar } from "./Sidebar";
import {
  InlineSearch,
  ListingHeader,
  SubcategoryTabs,
} from "./SubcategoryTabs";
import { ProductList } from "./ProductList";
import {
  getCategoryTitle,
  getProductCount,
  getProducts,
} from "@/lib/products";

export function StoreView({
  mode = "original",
}: {
  mode?: "original" | "redesign";
}) {
  const products = getProducts();
  const total = 329;
  const scrapedCount = getProductCount();

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1" style={{ background: "var(--cds-bg)" }}>
        <div className="max-w-[1280px] mx-auto px-4 py-4">
          <div className="flex gap-6">
            <Sidebar />
            <section className="flex-1 min-w-0">
              <PromoBanner />

              <h1 className="font-bold text-[22px] mt-5 mb-1">
                {getCategoryTitle()}
              </h1>
              <div
                className="h-px mb-2"
                style={{ background: "var(--cds-border)" }}
              />

              <InlineSearch count={total} />
              <SubcategoryTabs />

              <ListingHeader count={total} />

              <div
                className="h-px mb-3"
                style={{ background: "var(--cds-border)" }}
              />

              <ProductList products={products} mode={mode} />

              <div className="text-[12px] text-gray-500 mt-6 text-center">
                {scrapedCount} produits affichés — vue {mode === "original" ? "originale" : "redesign"}
              </div>
            </section>
          </div>
        </div>
      </main>
      <StickyPromoBar />
    </div>
  );
}
