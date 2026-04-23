import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const SNAPSHOTS_DIR = path.join(process.cwd(), "public", "snapshots");

function safeProjectSlug(raw: string): string | null {
  if (!raw) return null;
  return /^[a-zA-Z0-9_-]+$/.test(raw) ? raw : null;
}

/**
 * Supprime le dossier `public/snapshots/{slug}/` (métadonnées + HTML + assets).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug: raw } = await params;
  const slug = safeProjectSlug(raw);
  if (!slug) {
    return NextResponse.json({ error: "Slug invalide" }, { status: 400 });
  }

  const projectDir = path.join(SNAPSHOTS_DIR, slug);
  try {
    await fs.access(projectDir);
  } catch {
    return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
  }

  try {
    await fs.rm(projectDir, { recursive: true, force: true });
  } catch (e) {
    console.error("DELETE /api/projects/[slug]:", e);
    return NextResponse.json(
      { error: "Impossible de supprimer le projet" },
      { status: 500 },
    );
  }

  return new NextResponse(null, { status: 204 });
}
