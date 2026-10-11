import { SetMetadata } from "@nestjs/common";
import { ProjectRole } from "@cloudpilot/database";

export const PROJECT_ROLE_KEY = "project_role";
export const RequireProjectRole = (role: ProjectRole) =>
  SetMetadata(PROJECT_ROLE_KEY, role);
