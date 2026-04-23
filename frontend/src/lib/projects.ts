import { promises as fs } from "node:fs";
import path from "node:path";

export type ProjectStatus = "draft" | "ready";

export type ProjectMeta = {
  slug: string;
  url: string;
  title: string;
  documentWidth: number;
  documentHeight: number;
  imageCount: number;
  createdAt: string | null;
  hasRedesign: boolean;
  csvPairs: number;
  thumbnailUrl: string | null;
  status: ProjectStatus;
  finalizedAt: string | null;
};

type RawMeta = Partial<{
  slug: string;
  url: string;
  title: string;
  document_width: number;
  document_height: number;
  image_count: number;
  created_at: string;
  has_redesign: boolean;
  csv_pairs: number;
  thumbnail_url: string;
  status: string;
  finalized_at: string;
}>;

const SNAPSHOTS_DIR = path.join(process.cwd(), "public", "snapshots");

function safeProjectSlug(slug: string): string | null {
  if (!slug) return null;
  return /^[a-zA-Z0-9_-]+$/.test(slug) ? slug : null;
}

function normalizeMeta(raw: RawMeta, fallbackSlug: string): ProjectMeta {
  const createdAt = raw.created_at ?? null;
  const status = raw.status === "ready" ? "ready" : "draft";

  return {
    slug: raw.slug || fallbackSlug,
    url: raw.url || "",
    title: raw.title || raw.slug || fallbackSlug,
    documentWidth: Number(raw.document_width || 0),
    documentHeight: Number(raw.document_height || 0),
    imageCount: Number(raw.image_count || 0),
    createdAt,
    hasRedesign: Boolean(raw.has_redesign),
    csvPairs: Number(raw.csv_pairs || 0),
    thumbnailUrl: raw.thumbnail_url || null,
    status,
    finalizedAt: raw.finalized_at ?? null,
  };
}

async function readProjectMeta(slug: string): Promise<ProjectMeta | null> {
  const safeSlug = safeProjectSlug(slug);
  if (!safeSlug) return null;

  const metaPath = path.join(SNAPSHOTS_DIR, safeSlug, "meta.json");
  try {
    const content = await fs.readFile(metaPath, "utf-8");
    const raw = JSON.parse(content) as RawMeta;
    return normalizeMeta(raw, safeSlug);
  } catch {
    return null;
  }
}

export async function listProjects(): Promise<ProjectMeta[]> {
  let entries: fs.Dirent[] = [];
  try {
    entries = await fs.readdir(SNAPSHOTS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  const projects = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => readProjectMeta(entry.name)),
  );

  return projects
    .filter((project): project is ProjectMeta => project !== null)
    .sort((a, b) => {
      const aTs = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bTs = b.createdAt ? Date.parse(b.createdAt) : 0;
      return bTs - aTs;
    });
}

export async function getProject(slug: string): Promise<ProjectMeta | null> {
  return readProjectMeta(slug);
}
