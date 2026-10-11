import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  GitBranch,
  Globe,
  Terminal,
  Plus,
  CheckCircle2,
  Lock,
  Unlock,
  RefreshCw,
  Search,
  Zap,
} from "lucide-react";
import { GithubIcon } from "../components/ui/GithubIcon.js";
import { api, GitHubStatus, GitHubRepo, GitHubBranch } from "../lib/api.js";
import { Button } from "../components/ui/Button.js";
import { Input } from "../components/ui/Input.js";
import { Card } from "../components/ui/Card.js";
import { Badge } from "../components/ui/Badge.js";
import { ErrorAlert } from "../components/ui/ErrorAlert.js";
import { LoadingSpinner } from "../components/ui/LoadingSpinner.js";

export const CreateProjectPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Mode: 'github' or 'manual'
  const [importMode, setImportMode] = useState<"github" | "manual">("github");

  // GitHub State
  const [ghStatus, setGhStatus] = useState<GitHubStatus | null>(null);
  const [_isCheckingGh, setIsCheckingGh] = useState(true);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [repoSearch, setRepoSearch] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [_isLoadingBranches, setIsLoadingBranches] = useState(false);

  // Form Fields
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [autoDeployBranch, setAutoDeployBranch] = useState("main");
  const [autoDeployEnabled, setAutoDeployEnabled] = useState(true);
  const [port, setPort] = useState("3000");
  const [description, setDescription] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Check GitHub Connection Status
  useEffect(() => {
    if (searchParams.get("github") === "connected") {
      setSuccessNotice("GitHub account connected successfully!");
    }

    const checkStatus = async () => {
      try {
        const status = await api.github.status();
        setGhStatus(status);
        if (status.connected) {
          loadRepositories();
        } else {
          setImportMode("manual");
        }
      } catch {
        setImportMode("manual");
      } finally {
        setIsCheckingGh(false);
      }
    };
    checkStatus();
  }, [searchParams]);

  const loadRepositories = async () => {
    setIsLoadingRepos(true);
    setError(null);
    try {
      const data = await api.github.repositories();
      setRepos(data);
    } catch (err: any) {
      setError(err.message || "Failed to load GitHub repositories");
    } finally {
      setIsLoadingRepos(false);
    }
  };

  const handleConnectGitHub = async () => {
    try {
      const { authorizationUrl, configured } = await api.github.connect();
      if (!configured) {
        setError(
          "GitHub OAuth credentials (GITHUB_CLIENT_ID & GITHUB_CLIENT_SECRET) are not configured in backend .env. Please set them or use manual Git URL.",
        );
        return;
      }
      window.location.href = authorizationUrl;
    } catch (err: any) {
      setError(err.message || "Failed to initiate GitHub authorization");
    }
  };

  const handleDisconnectGitHub = async () => {
    try {
      await api.github.disconnect();
      setGhStatus({
        connected: false,
        configured: ghStatus?.configured ?? false,
      });
      setRepos([]);
      setSelectedRepo(null);
      setImportMode("manual");
    } catch (err: any) {
      setError(err.message || "Failed to disconnect GitHub");
    }
  };

  const handleSelectRepo = async (repo: GitHubRepo) => {
    setSelectedRepo(repo);
    setName(repo.name);
    const autoSlug = repo.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
    setSlug(autoSlug);
    setRepositoryUrl(repo.htmlUrl);
    setDefaultBranch(repo.defaultBranch);
    setAutoDeployBranch(repo.defaultBranch);
    setDescription(repo.description || "");

    // Load branches
    setIsLoadingBranches(true);
    try {
      const bList = await api.github.branches(repo.owner, repo.name);
      setBranches(bList);
    } catch {
      setBranches([]);
    } finally {
      setIsLoadingBranches(false);
    }
  };

  const handleNameChange = (val: string) => {
    setName(val);
    const autoSlug = val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
    setSlug(autoSlug);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name || !slug || !repositoryUrl) {
      setError("Please fill in all required fields");
      return;
    }

    setIsLoading(true);
    try {
      const created = await api.projects.create({
        name,
        slug,
        repositoryUrl,
        repositoryId: selectedRepo ? String(selectedRepo.id) : undefined,
        repositoryFullName: selectedRepo ? selectedRepo.fullName : undefined,
        repositoryOwner: selectedRepo ? selectedRepo.owner : undefined,
        defaultBranch: defaultBranch || "main",
        autoDeployBranch: autoDeployBranch || defaultBranch || "main",
        autoDeployEnabled,
        port: parseInt(port, 10) || 3000,
        description: description || undefined,
      });

      navigate(`/projects/${created.slug}`);
    } catch (err: any) {
      setError(err.message || "Failed to create project");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredRepos = repos.filter(
    (r) =>
      r.name.toLowerCase().includes(repoSearch.toLowerCase()) ||
      r.fullName.toLowerCase().includes(repoSearch.toLowerCase()),
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/projects")}
          icon={<ArrowLeft className="w-4 h-4" />}
        >
          Back
        </Button>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Create New Project
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Connect a Git repository to provision automated deployments with
            CloudPilot
          </p>
        </div>
      </div>

      {successNotice && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center justify-between text-xs text-emerald-400">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{successNotice}</span>
          </div>
          <button
            onClick={() => setSuccessNotice(null)}
            className="text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {/* GitHub Account Header Card */}
      <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-900/60 border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-white">
            <GithubIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">
                GitHub Integration
              </span>
              {ghStatus?.connected ? (
                <Badge variant="success" size="sm">
                  Connected
                </Badge>
              ) : (
                <Badge variant="default" size="sm">
                  Not Connected
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {ghStatus?.connected
                ? `Authorized as @${ghStatus.username}. Access to your personal and organization repos.`
                : "Connect your GitHub account to import repositories with one click and enable auto-deploy."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {ghStatus?.connected ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={loadRepositories}
                isLoading={isLoadingRepos}
                icon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Refresh Repos
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleDisconnectGitHub}
              >
                Disconnect
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleConnectGitHub}
              icon={<GithubIcon className="w-4 h-4" />}
            >
              Connect GitHub
            </Button>
          )}
        </div>
      </Card>

      {/* Tab Switcher: GitHub vs Manual */}
      <div className="flex border-b border-slate-800 gap-6">
        <button
          type="button"
          onClick={() => setImportMode("github")}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            importMode === "github"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <GithubIcon className="w-4 h-4" />
          Select from GitHub
        </button>
        <button
          type="button"
          onClick={() => setImportMode("manual")}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            importMode === "manual"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Globe className="w-4 h-4" />
          Custom Git Repository URL
        </button>
      </div>

      {/* GitHub Repository Browser */}
      {importMode === "github" && (
        <Card className="space-y-4">
          {!ghStatus?.connected ? (
            <div className="py-8 text-center space-y-3">
              <GithubIcon className="w-10 h-10 text-slate-600 mx-auto" />
              <div className="max-w-md mx-auto">
                <h3 className="text-sm font-semibold text-white">
                  GitHub Account Not Connected
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Connect your GitHub account to browse your public and private
                  repositories, or switch to the Custom Git URL tab.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConnectGitHub}
                icon={<GithubIcon className="w-4 h-4" />}
              >
                Connect GitHub Account
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search repositories..."
                    value={repoSearch}
                    onChange={(e) => setRepoSearch(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <span className="text-xs text-slate-400">
                  Showing {filteredRepos.length} of {repos.length} repositories
                </span>
              </div>

              {isLoadingRepos ? (
                <div className="py-12 flex justify-center">
                  <LoadingSpinner size="md" />
                </div>
              ) : filteredRepos.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  {repoSearch
                    ? "No repositories match your search"
                    : "No repositories found"}
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-800/40">
                  {filteredRepos.map((repo) => {
                    const isSelected = selectedRepo?.id === repo.id;
                    return (
                      <div
                        key={repo.id}
                        onClick={() => handleSelectRepo(repo)}
                        className={`pt-2 p-3 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? "bg-indigo-950/30 border-indigo-500/60 ring-1 ring-indigo-500/30"
                            : "bg-slate-900/40 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700"
                        }`}
                      >
                        <div className="space-y-1 min-w-0 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white truncate">
                              {repo.fullName}
                            </span>
                            {repo.private ? (
                              <Badge variant="default" size="sm">
                                <Lock className="w-2.5 h-2.5 mr-1" />
                                Private
                              </Badge>
                            ) : (
                              <Badge variant="outline" size="sm">
                                <Unlock className="w-2.5 h-2.5 mr-1" />
                                Public
                              </Badge>
                            )}
                          </div>
                          {repo.description && (
                            <p className="text-xs text-slate-400 truncate">
                              {repo.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 text-[11px] text-slate-500">
                            <span className="flex items-center gap-1">
                              <GitBranch className="w-3 h-3" />
                              {repo.defaultBranch}
                            </span>
                            <span>
                              Updated{" "}
                              {new Date(repo.updatedAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant={isSelected ? "primary" : "outline"}
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectRepo(repo);
                          }}
                        >
                          {isSelected ? "Selected" : "Import"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* Project Provisioning Form */}
      <form onSubmit={handleSubmit}>
        <Card className="space-y-5">
          <div className="border-b border-slate-800/80 pb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white tracking-wide uppercase">
              Project Configuration
            </h2>
            {selectedRepo && (
              <span className="text-xs text-indigo-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Linked to {selectedRepo.fullName}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Project Name *"
              required
              placeholder="e.g. Acme API Gateway"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
            />

            <Input
              label="URL Slug *"
              required
              placeholder="e.g. acme-api-gateway"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              hint="Unique identifier used in CloudPilot URLs"
            />
          </div>

          <Input
            label="Git Repository URL *"
            type="text"
            required
            placeholder="https://github.com/owner/repository"
            value={repositoryUrl}
            onChange={(e) => setRepositoryUrl(e.target.value)}
            icon={<Globe className="w-4 h-4" />}
            hint="Repository clone or HTTPS URL"
            readOnly={Boolean(selectedRepo)}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {branches.length > 0 ? (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300 tracking-wider uppercase">
                  Default Branch
                </label>
                <select
                  value={defaultBranch}
                  onChange={(e) => {
                    setDefaultBranch(e.target.value);
                    setAutoDeployBranch(e.target.value);
                  }}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  {branches.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}{" "}
                      {b.name === selectedRepo?.defaultBranch
                        ? "(default)"
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <Input
                label="Default Branch"
                placeholder="main"
                value={defaultBranch}
                onChange={(e) => {
                  setDefaultBranch(e.target.value);
                  setAutoDeployBranch(e.target.value);
                }}
                icon={<GitBranch className="w-4 h-4" />}
              />
            )}

            <Input
              label="Application Port"
              type="number"
              placeholder="3000"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              icon={<Terminal className="w-4 h-4" />}
              hint="Port container listens on inside the container"
            />
          </div>

          {/* Auto-Deploy on Git Push Setting */}
          <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-white">
                  Automatic Deployment on Git Push
                </span>
              </div>
              <input
                type="checkbox"
                checked={autoDeployEnabled}
                onChange={(e) => setAutoDeployEnabled(e.target.checked)}
                className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
              />
            </div>
            <p className="text-xs text-slate-400">
              When enabled, incoming push webhooks to the selected branch will
              automatically trigger a new deployment queue.
            </p>

            {autoDeployEnabled && (
              <div className="pt-2 flex items-center gap-3">
                <label className="text-xs text-slate-300 font-medium">
                  Trigger Branch:
                </label>
                {branches.length > 0 ? (
                  <select
                    value={autoDeployBranch}
                    onChange={(e) => setAutoDeployBranch(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    {branches.map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={autoDeployBranch}
                    onChange={(e) => setAutoDeployBranch(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 w-32"
                    placeholder="main"
                  />
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300 tracking-wider uppercase">
              Description (Optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short overview of what this application does..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate("/projects")}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isLoading}
              icon={<Plus className="w-4 h-4" />}
            >
              Provision Project
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
};
