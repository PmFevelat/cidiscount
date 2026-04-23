import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 600;

const REPO_ROOT = path.resolve(process.cwd(), "..");
const VENV_PYTHON = path.join(REPO_ROOT, ".venv", "bin", "python3");
const FRONTEND_DIR = process.cwd();

function slugifyFallback(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").split(".")[0];
    const pathPart = u.pathname
      .split("/")
      .filter(Boolean)
      .slice(-2)
      .join("-");
    const raw = [host, pathPart].filter(Boolean).join("-");
    return (
      raw
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64) || `project-${randomUUID().slice(0, 8)}`
    );
  } catch {
    return `project-${randomUUID().slice(0, 8)}`;
  }
}

function sanitizeSlug(rawSlug: string): string {
  return rawSlug.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "");
}

async function pickPythonBin(): Promise<string> {
  return fs
    .stat(VENV_PYTHON)
    .then(() => VENV_PYTHON)
    .catch(() => "python3");
}

async function saveTempCsv(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const tempCsvPath = path.join(os.tmpdir(), `snapshot-csv-${randomUUID()}.csv`);
  await fs.writeFile(tempCsvPath, buf);
  return tempCsvPath;
}

function streamCommand(params: {
  pythonBin: string;
  args: string[];
  donePayload: Record<string, unknown>;
  cleanupPaths?: string[];
}) {
  const { pythonBin, args, donePayload, cleanupPaths = [] } = params;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const child = spawn(pythonBin, args, {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
        },
      });

      const send = (line: string) => {
        controller.enqueue(encoder.encode(line + "\n"));
      };

      send(`▸ Pipeline: ${pythonBin} ${args.join(" ")}`);

      let stderrBuffer = "";
      child.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf-8");
        for (const line of text.split(/\r?\n/)) {
          if (line.trim()) send(line);
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf-8");
        stderrBuffer += text;
        for (const line of text.split(/\r?\n/)) {
          if (line.trim()) send(`! ${line}`);
        }
      });

      child.on("close", async (code, signal) => {
        for (const p of cleanupPaths) {
          await fs.unlink(p).catch(() => {});
        }
        if (code === 0) {
          send(`__DONE__ ${JSON.stringify(donePayload)}`);
        } else {
          let detail =
            stderrBuffer.trim().split(/\r?\n/).slice(-3).join(" | ") ||
            `exit code ${code}`;
          if (signal) {
            detail = `${detail} (signal: ${signal})`;
          }
          send(`__ERROR__ ${detail}`);
        }
        controller.close();
      });

      child.on("error", async (err) => {
        for (const p of cleanupPaths) {
          await fs.unlink(p).catch(() => {});
        }
        send(`__ERROR__ ${err.message}`);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const phase = String(form.get("phase") ?? "scrape").trim();
  const pythonBin = await pickPythonBin();

  if (phase === "scrape") {
    const url = String(form.get("url") ?? "").trim();
    const rawSlug = String(form.get("slug") ?? "").trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return new Response("URL invalide", { status: 400 });
    }

    const slug = sanitizeSlug(rawSlug) || slugifyFallback(url);
    const args = [
      "-m",
      "scraper.pipeline",
      "--url",
      url,
      "--slug",
      slug,
      "--frontend-dir",
      FRONTEND_DIR,
    ];
    return streamCommand({
      pythonBin,
      args,
      donePayload: {
        slug,
        csvUrl: `/snapshots/${slug}/images.csv`,
        projectUrl: `/projects/${slug}`,
      },
    });
  }

  if (phase === "finalize") {
    const slug = sanitizeSlug(String(form.get("slug") ?? "").trim());
    const csvFile = form.get("csv");
    if (!slug) {
      return new Response("Slug manquant", { status: 400 });
    }
    if (!(csvFile instanceof File)) {
      return new Response("CSV manquant", { status: 400 });
    }
    const tempCsvPath = await saveTempCsv(csvFile);
    const args = [
      "-m",
      "scraper.finalize_project",
      "--slug",
      slug,
      "--csv",
      tempCsvPath,
      "--frontend-dir",
      FRONTEND_DIR,
    ];
    return streamCommand({
      pythonBin,
      args,
      donePayload: {
        slug,
        projectUrl: `/projects/${slug}`,
      },
      cleanupPaths: [tempCsvPath],
    });
  }

  return new Response("Phase inconnue. Valeurs autorisées: scrape, finalize.", {
    status: 400,
  });
}
