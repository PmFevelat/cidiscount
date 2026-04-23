import type { Product } from "@/lib/products";
import { ProductCard } from "./ProductCard";

export function ProductList({
  products,
  mode = "original",
}: {
  products: Product[];
  mode?: "original" | "redesign";
}) {
  return (
    <div className="flex flex-col gap-3">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} mode={mode} />
      ))}
    </div>
  );
}
