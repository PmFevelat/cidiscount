import { ProjectsGrid } from "@/components/ProjectsGrid";
import { listProjects } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function Home() {
  const projects = await listProjects();
  return <ProjectsGrid projects={projects} />;
}
