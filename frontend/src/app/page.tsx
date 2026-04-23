import { ProjectsGrid } from "@/components/ProjectsGrid";
import { listProjectsByKind } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [catalogProjects, pdpProjects] = await Promise.all([
    listProjectsByKind("catalog"),
    listProjectsByKind("pdp"),
  ]);

  return (
    <ProjectsGrid catalogProjects={catalogProjects} pdpProjects={pdpProjects} />
  );
}
