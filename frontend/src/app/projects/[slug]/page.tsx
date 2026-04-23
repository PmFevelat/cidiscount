import Link from "next/link";
import { notFound } from "next/navigation";
import { BeforeAfterSlider } from "@/components/BeforeAfterSlider";
import { PdpSplitScaledIframe } from "@/components/PdpSplitScaledIframe";
import { PdpSplitScreen } from "@/components/PdpSplitScreen";
import { SnapshotFrame } from "@/components/SnapshotFrame";
import { getProject } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProject(slug);
  if (!project) notFound();

  const originalSrc = `/snapshots/${slug}/original.html`;
  const redesignSrc = `/snapshots/${slug}/redesign.html`;
  const fallbackHeight = project.documentHeight || 2400;

  if (project.kind === "pdp") {
    const pdpSandbox =
      "allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox";

    return (
      <div className="relative h-[100dvh] w-full overflow-hidden bg-neutral-950">
        <div
          className="fixed top-4 left-4 z-[80]"
          style={{ pointerEvents: "auto" }}
        >
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-white/95 backdrop-blur px-3 py-2 text-[13px] font-medium text-gray-800 shadow-md transition hover:bg-white"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Retour aux projets
          </Link>
        </div>

        <PdpSplitScreen
          left={
            <PdpSplitScaledIframe
              src={originalSrc}
              title={`${project.title} — PDP historique (gauche)`}
              fallbackHeight={fallbackHeight}
              sandbox={pdpSandbox}
            />
          }
          right={
            <PdpSplitScaledIframe
              src={redesignSrc}
              title={`${project.title} — PDP redesign (droite)`}
              fallbackHeight={fallbackHeight}
              sandbox={pdpSandbox}
            />
          }
        />
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        className="fixed top-4 left-4 z-[80]"
        style={{ pointerEvents: "auto" }}
      >
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full bg-white/95 backdrop-blur px-3 py-2 text-[13px] font-medium text-gray-800 shadow-md hover:bg-white transition"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Retour aux projets
        </Link>
      </div>

      <BeforeAfterSlider
        before={
          <SnapshotFrame
            src={originalSrc}
            title={`${project.title} — original`}
            fallbackHeight={fallbackHeight}
          />
        }
        after={
          <SnapshotFrame
            src={redesignSrc}
            title={`${project.title} — redesign`}
            fallbackHeight={fallbackHeight}
          />
        }
      />
    </div>
  );
}
