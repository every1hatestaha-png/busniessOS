import "server-only";

import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/server/auth";
import { listWorkspaceModules } from "@/lib/server/industry-modules";
import { canOpenVerticalRoute } from "@/lib/verticals/registry";

export async function requireVerticalRoute(path: string) {
  const context = await requireWorkspace();
  const modules = await listWorkspaceModules(context.workspaceId);
  if (!canOpenVerticalRoute(context.vertical, path, modules.filter((module) => module.enabled).map((module) => module.moduleKey))) notFound();
  return context;
}
