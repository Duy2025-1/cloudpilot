export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "DEVELOPER" | "VIEWER";
  avatarUrl?: string | null;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  repositoryUrl: string;
  repositoryId?: string | null;
  repositoryFullName?: string | null;
  repositoryOwner?: string | null;
  defaultBranch: string;
  autoDeployBranch?: string | null;
  autoDeployEnabled?: boolean;
  webhookSecret?: string | null;
  port: number;
  memoryLimitMb: number;
  cpuLimit: number;
  status: "IDLE" | "BUILDING" | "RUNNING" | "FAILED" | "STOPPED";
  createdAt: string;
  updatedAt: string;
  environments?: Environment[];
  members?: Array<{
    userId: string;
    role: "OWNER" | "MAINTAINER" | "DEVELOPER" | "VIEWER";
    user: { id: string; name: string; email: string };
  }>;
  _count?: {
    deployments: number;
    members: number;
  };
}

export interface Environment {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  isProduction: boolean;
  createdAt: string;
  _count?: {
    deployments: number;
    envVars: number;
  };
}

export interface EnvVar {
  id: string;
  environmentId: string;
  key: string;
  value: string;
  isSecret: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Deployment {
  id: string;
  projectId: string;
  environmentId: string;
  commitSha: string;
  commitMessage?: string | null;
  branch: string;
  status:
    | "QUEUED"
    | "CLONING"
    | "BUILDING"
    | "DEPLOYING"
    | "HEALTH_CHECKING"
    | "SUCCEEDED"
    | "SUCCESS"
    | "FAILED"
    | "CANCELLED"
    | "TIMED_OUT"
    | "ROLLED_BACK";
  containerId?: string | null;
  containerPort?: number | null;
  imageTag?: string | null;
  imageDigest?: string | null;
  durationMs?: number | null;
  createdAt: string;
  finishedAt?: string | null;
  logs?: Array<{
    id: string;
    level: string;
    step: string;
    message: string;
    createdAt: string;
  }>;
}

export interface DeploymentLog {
  id: string;
  deploymentId: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  step: string;
  message: string;
  createdAt: string;
}

export interface Release {
  id: string;
  projectId: string;
  environmentId: string;
  deploymentId: string;
  version: number;
  status: "ACTIVE" | "INACTIVE" | "ROLLED_BACK";
  imageTag?: string | null;
  activeContainerId?: string | null;
  activePort?: number | null;
  activatedAt: string;
  retiredAt?: string | null;
  deployment?: Deployment;
}

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  htmlUrl: string;
  defaultBranch: string;
  description: string | null;
  updatedAt: string;
}

export interface GitHubBranch {
  name: string;
  commitSha: string;
  protected: boolean;
}

export interface GitHubCommit {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export interface GitHubStatus {
  connected: boolean;
  configured: boolean;
  username?: string;
  avatarUrl?: string;
  scope?: string;
}

const API_BASE = "/api/v1";

export async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const response = await fetch(url, {
    ...options,
    credentials: "include", // Automatically send and receive HttpOnly session cookies
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg =
      payload?.error?.message ||
      payload?.message ||
      `HTTP Error ${response.status}: ${response.statusText}`;
    const error = new Error(errorMsg) as Error & {
      status: number;
      code?: string;
    };
    error.status = response.status;
    error.code = payload?.error?.code;
    throw error;
  }

  // Unwrap standardized ApiResponse { success: true, data: T }
  if (payload && typeof payload === "object" && "data" in payload) {
    return payload.data as T;
  }

  return payload as T;
}

export const api = {
  auth: {
    me: () => fetchApi<{ user: User }>("/auth/me"),
    login: (credentials: { email: string; password: string }) =>
      fetchApi<{ user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(credentials),
      }),
    register: (data: { name: string; email: string; password: string }) =>
      fetchApi<{ user: User }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    logout: () =>
      fetchApi<{ message: string }>("/auth/logout", {
        method: "POST",
      }),
  },
  projects: {
    list: () => fetchApi<Project[]>("/projects"),
    get: (idOrSlug: string) => fetchApi<Project>(`/projects/${idOrSlug}`),
    create: (data: {
      name: string;
      slug: string;
      repositoryUrl: string;
      repositoryId?: string;
      repositoryFullName?: string;
      repositoryOwner?: string;
      defaultBranch?: string;
      autoDeployBranch?: string;
      autoDeployEnabled?: boolean;
      port?: number;
      description?: string;
    }) =>
      fetchApi<Project>("/projects", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    delete: (idOrSlug: string) =>
      fetchApi<{ deleted: boolean; id: string }>(`/projects/${idOrSlug}`, {
        method: "DELETE",
      }),
  },
  environments: {
    getVars: (environmentId: string) =>
      fetchApi<EnvVar[]>(`/environments/${environmentId}/vars`),
    setVar: (
      environmentId: string,
      data: { key: string; value: string; isSecret?: boolean },
    ) =>
      fetchApi<EnvVar>(`/environments/${environmentId}/vars`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    deleteVar: (environmentId: string, key: string) =>
      fetchApi<{ deleted: boolean; key: string }>(
        `/environments/${environmentId}/vars/${key}`,
        { method: "DELETE" },
      ),
  },
  deployments: {
    list: async (projectId?: string) => {
      const res = await fetchApi<any>(
        projectId ? `/deployments?projectId=${projectId}` : "/deployments",
      );
      return Array.isArray(res)
        ? (res as Deployment[])
        : (res?.data as Deployment[]) || [];
    },
    get: (id: string) => fetchApi<Deployment>(`/deployments/${id}`),
    logs: (id: string) => fetchApi<DeploymentLog[]>(`/deployments/${id}/logs`),
    cancel: (id: string) =>
      fetchApi<Deployment>(`/deployments/${id}/cancel`, { method: "POST" }),
    rollback: (data: {
      projectId: string;
      environmentId: string;
      targetReleaseId: string;
    }) =>
      fetchApi<Deployment>("/deployments/rollback", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    trigger: (data: {
      projectId: string;
      environmentId: string;
      commitSha: string;
      branch?: string;
      commitMessage?: string;
    }) =>
      fetchApi<Deployment>("/deployments", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
  github: {
    connect: () =>
      fetchApi<{
        authorizationUrl: string;
        state: string;
        configured: boolean;
      }>("/github/connect"),
    status: () => fetchApi<GitHubStatus>("/github/status"),
    disconnect: () =>
      fetchApi<{ success: boolean }>("/github/disconnect", {
        method: "POST",
      }),
    repositories: () => fetchApi<GitHubRepo[]>("/github/repositories"),
    branches: (owner: string, repo: string) =>
      fetchApi<GitHubBranch[]>(
        `/github/repositories/${owner}/${repo}/branches`,
      ),
    commits: (owner: string, repo: string, branch?: string) =>
      fetchApi<GitHubCommit[]>(
        `/github/repositories/${owner}/${repo}/commits${branch ? `?branch=${encodeURIComponent(branch)}` : ""}`,
      ),
  },
};
