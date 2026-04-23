import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const require = createRequire(import.meta.url);

function fail(msg) {
  console.error(`\n[check-next] ${msg}\n`);
  process.exit(1);
}

if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) {
  fail(
    "Fichier pnpm-lock.yaml détecté. Supprime-le : rm pnpm-lock.yaml\n" +
      "Puis : rm -rf node_modules .next && npm install",
  );
}

const pnpmStore = path.join(root, "node_modules", ".pnpm");
if (fs.existsSync(pnpmStore)) {
  fail(
    "Arborescence pnpm (node_modules/.pnpm) détectée.\n" +
      "Tu as dû lancer pnpm install par erreur. Fais :\n" +
      "  rm -rf node_modules .next pnpm-lock.yaml\n" +
      "  npm install\n" +
      "Et n'interromps pas (pas de Ctrl+C) avant la fin.",
  );
}

try {
  require.resolve("typescript", { paths: [root] });
} catch {
  fail(
    "TypeScript introuvable. Lance : npm install (sans interrompre) puis réessaie.",
  );
}

const nextPkg = path.dirname(
  require.resolve("next/package.json", { paths: [root] }),
);
const patchFetch = path.join(nextPkg, "dist", "server", "lib", "patch-fetch.js");
if (!fs.existsSync(patchFetch)) {
  fail(
    "Installation Next.js incomplète (patch-fetch manquant).\n" +
      "  rm -rf node_modules .next\n" +
      "  npm install\n" +
      "N'utilise pas pnpm dans ce dossier.",
  );
}

console.log("[check-next] OK — dépendances prêtes.");
