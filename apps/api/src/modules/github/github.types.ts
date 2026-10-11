export interface GitHubRepoSummary {
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

export interface GitHubBranchSummary {
  name: string;
  commitSha: string;
  protected: boolean;
}

export interface GitHubCommitSummary {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export interface GitHubConnectionStatus {
  connected: boolean;
  configured: boolean;
  username?: string;
  avatarUrl?: string;
  scope?: string;
}
