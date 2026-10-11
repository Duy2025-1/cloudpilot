import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  GitBranch,
  ExternalLink,
  Play,
  Trash2,
  Lock,
  Plus,
  Shield,
  Terminal,
  AlertTriangle,
  Zap,
  Copy,
  Check,
  RotateCcw,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { GithubIcon } from "../components/ui/GithubIcon.js";
import {
  api,
  Project,
  EnvVar,
  Deployment,
  GitHubCommit,
  DeploymentLog,
} from "../lib/api.js";
import { Button } from "../components/ui/Button.js";
import { Badge } from "../components/ui/Badge.js";
import { Card } from "../components/ui/Card.js";
import { Input } from "../components/ui/Input.js";
import { Modal } from "../components/ui/Modal.js";
import { LoadingSpinner } from "../components/ui/LoadingSpinner.js";
import { ErrorAlert } from "../components/ui/ErrorAlert.js";
import { EmptyState } from "../components/ui/EmptyState.js";

export const ProjectDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState<
    "deployments" | "env" | "settings"
  >("deployments");
  const [selectedEnvId, setSelectedEnvId] = useState<string>("");
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Env Var Form State
  const [newVarKey, setNewVarKey] = useState("");
  const [newVarValue, setNewVarValue] = useState("");
  const [isVarSecret, setIsVarSecret] = useState(true);
  const [isSavingVar, setIsSavingVar] = useState(false);

  // Trigger Deploy Modal State
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [deployCommitSha, setDeployCommitSha] = useState("");
  const [deployCommitMsg, setDeployCommitMsg] = useState("");
  const [isDeploying, setIsDeploying] = useState(false);
  const [recentCommits, setRecentCommits] = useState<GitHubCommit[]>([]);
  const [isLoadingCommits, setIsLoadingCommits] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // Live Logs Modal State
  const [activeLogDeployment, setActiveLogDeployment] =
    useState<Deployment | null>(null);
  const [activeLogs, setActiveLogs] = useState<DeploymentLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);

  const handleOpenDeployModal = async () => {
    setIsDeployModalOpen(true);
    if (!project) return;

    // Check if we can load commits from GitHub
    let owner = project.repositoryOwner;
    let repoName = "";

    if (
      project.repositoryFullName &&
      project.repositoryFullName.includes("/")
    ) {
      const parts = project.repositoryFullName.split("/");
      owner = parts[0] || "";
      repoName = parts[1] || "";
    } else if (project.repositoryUrl.includes("github.com/")) {
      const match = project.repositoryUrl.match(
        /github\.com\/([^/]+)\/([^/.]+)/,
      );
      if (match) {
        owner = match[1] || "";
        repoName = match[2] || "";
      }
    }

    if (owner && repoName) {
      setIsLoadingCommits(true);
      try {
        const commits = await api.github.commits(
          owner,
          repoName,
          project.defaultBranch,
        );
        setRecentCommits(commits);
      } catch {
        // Fallback silently to manual SHA input if GitHub account is not connected or token lacks permission
        setRecentCommits([]);
      } finally {
        setIsLoadingCommits(false);
      }
    }
  };

  // Delete Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Live Logs Polling Effect
  useEffect(() => {
    if (!activeLogDeployment) return;

    const isActive = [
      "QUEUED",
      "CLONING",
      "BUILDING",
      "DEPLOYING",
      "HEALTH_CHECKING",
    ].includes(activeLogDeployment.status);

    if (!isActive) return;

    const interval = setInterval(async () => {
      try {
        const [updatedDep, logs] = await Promise.all([
          api.deployments.get(activeLogDeployment.id),
          api.deployments.logs(activeLogDeployment.id),
        ]);
        setActiveLogDeployment(updatedDep);
        setActiveLogs(logs);
        setDeployments((prev) =>
          prev.map((d) => (d.id === updatedDep.id ? updatedDep : d)),
        );
      } catch {
        // Continue
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeLogDeployment?.id, activeLogDeployment?.status]);

  const handleOpenLogs = async (dep: Deployment) => {
    setActiveLogDeployment(dep);
    setIsLoadingLogs(true);
    try {
      const logs = await api.deployments.logs(dep.id);
      setActiveLogs(logs);
    } catch {
      setActiveLogs([]);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleCancelDeployment = async (depId: string) => {
    setIsCancelling(true);
    try {
      const cancelled = await api.deployments.cancel(depId);
      setActiveLogDeployment((prev) =>
        prev && prev.id === depId ? cancelled : prev,
      );
      setDeployments((prev) =>
        prev.map((d) => (d.id === depId ? cancelled : d)),
      );
    } catch (err: any) {
      setError(err.message || "Failed to cancel deployment");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRollbackDeployment = async (dep: Deployment) => {
    if (!project || !selectedEnvId) return;
    setIsRollingBack(true);
    try {
      const rollbackDep = await api.deployments.trigger({
        projectId: project.id,
        environmentId: selectedEnvId,
        commitSha: dep.commitSha,
        branch: dep.branch,
        commitMessage: `Rollback to commit ${dep.commitSha.substring(0, 7)}`,
      });

      setDeployments((prev) => [rollbackDep, ...prev]);
      handleOpenLogs(rollbackDep);
    } catch (err: any) {
      setError(err.message || "Failed to trigger rollback");
    } finally {
      setIsRollingBack(false);
    }
  };

  const fetchProjectData = async () => {
    if (!slug) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.projects.get(slug);
      setProject(data);

      const defaultEnv = data.environments?.[0]?.id || "";
      setSelectedEnvId(defaultEnv);

      // Fetch deployments
      const depData = await api.deployments.list(data.id);
      setDeployments(depData);

      // Fetch env vars for default env
      if (defaultEnv) {
        const varsData = await api.environments.getVars(defaultEnv);
        setEnvVars(varsData);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load project details");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectData();
  }, [slug]);

  const handleSelectEnv = async (envId: string) => {
    setSelectedEnvId(envId);
    try {
      const vars = await api.environments.getVars(envId);
      setEnvVars(vars);
    } catch (err: any) {
      setError(err.message || "Failed to fetch environment variables");
    }
  };

  const handleAddEnvVar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEnvId || !newVarKey || !newVarValue) return;

    setIsSavingVar(true);
    try {
      await api.environments.setVar(selectedEnvId, {
        key: newVarKey.toUpperCase(),
        value: newVarValue,
        isSecret: isVarSecret,
      });

      setNewVarKey("");
      setNewVarValue("");
      const updated = await api.environments.getVars(selectedEnvId);
      setEnvVars(updated);
    } catch (err: any) {
      setError(err.message || "Failed to save environment variable");
    } finally {
      setIsSavingVar(false);
    }
  };

  const handleDeleteEnvVar = async (key: string) => {
    if (!selectedEnvId) return;
    try {
      await api.environments.deleteVar(selectedEnvId, key);
      setEnvVars((prev) => prev.filter((v) => v.key !== key));
    } catch (err: any) {
      setError(err.message || "Failed to delete variable");
    }
  };

  const handleTriggerDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !selectedEnvId || !deployCommitSha) return;

    setIsDeploying(true);
    try {
      await api.deployments.trigger({
        projectId: project.id,
        environmentId: selectedEnvId,
        commitSha: deployCommitSha,
        commitMessage: deployCommitMsg || undefined,
        branch: project.defaultBranch,
      });

      setIsDeployModalOpen(false);
      setDeployCommitSha("");
      setDeployCommitMsg("");

      // Refresh deployments
      const depData = await api.deployments.list(project.id);
      setDeployments(depData);
    } catch (err: any) {
      setError(err.message || "Failed to trigger deployment");
    } finally {
      setIsDeploying(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!project || deleteConfirmText !== project.slug) return;
    setIsDeleting(true);
    try {
      await api.projects.delete(project.id);
      navigate("/projects");
    } catch (err: any) {
      setError(err.message || "Failed to delete project");
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner message="Fetching project details..." />;
  }

  if (error && !project) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-white">
          Access Denied or Not Found
        </h2>
        <p className="text-xs text-slate-400 max-w-md mx-auto">{error}</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate("/projects")}
        >
          Return to Projects
        </Button>
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/projects")}
            icon={<ArrowLeft className="w-4 h-4" />}
          >
            Projects
          </Button>
          <div className="h-4 w-px bg-slate-800" />
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-white tracking-tight">
                {project.name}
              </h1>
              <Badge status={project.status} />
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 font-mono">
              <span className="flex items-center gap-1">
                <GitBranch className="w-3.5 h-3.5" />
                {project.defaultBranch}
              </span>
              <span>•</span>
              <a
                href={project.repositoryUrl}
                target="_blank"
                rel="noreferrer"
                className="hover:text-indigo-400 transition-colors flex items-center gap-1"
              >
                <GithubIcon className="w-3.5 h-3.5" />
                <span>
                  {project.repositoryFullName ||
                    project.repositoryUrl.replace(/^https?:\/\//, "")}
                </span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <span>•</span>
              <span>Port {project.port}</span>
              <span>•</span>
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-sans ${
                  project.autoDeployEnabled
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                    : "bg-slate-800 text-slate-400 border border-slate-700"
                }`}
              >
                <Zap className="w-3 h-3" />
                {project.autoDeployEnabled
                  ? `Auto-Deploy: ${project.autoDeployBranch || project.defaultBranch}`
                  : "Auto-Deploy: Off"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenDeployModal}
            icon={<Play className="w-3.5 h-3.5" />}
          >
            Trigger Deployment
          </Button>
        </div>
      </div>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {/* Tabs */}
      <div className="flex border-b border-slate-800/80 gap-6">
        <button
          onClick={() => setActiveTab("deployments")}
          className={`pb-3 text-xs font-semibold tracking-wider uppercase transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === "deployments"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Terminal className="w-4 h-4" />
          Deployments ({deployments.length})
        </button>

        <button
          onClick={() => setActiveTab("env")}
          className={`pb-3 text-xs font-semibold tracking-wider uppercase transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === "env"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Lock className="w-4 h-4" />
          Environment Variables ({envVars.length})
        </button>

        <button
          onClick={() => setActiveTab("settings")}
          className={`pb-3 text-xs font-semibold tracking-wider uppercase transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === "settings"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Shield className="w-4 h-4" />
          Settings & Security
        </button>
      </div>

      {/* Tab 1: Deployments */}
      {activeTab === "deployments" && (
        <div className="space-y-4">
          {deployments.length === 0 ? (
            <EmptyState
              icon={<Terminal className="w-6 h-6" />}
              title="No deployments found"
              description="No deployments have been executed for this project yet. Trigger a build from the top button."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleOpenDeployModal}
                  icon={<Play className="w-3.5 h-3.5" />}
                >
                  Deploy Commit
                </Button>
              }
            />
          ) : (
            <Card className="p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800/80">
                    <tr>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Commit SHA</th>
                      <th className="px-4 py-3">Branch</th>
                      <th className="px-4 py-3">Message</th>
                      <th className="px-4 py-3">Duration</th>
                      <th className="px-4 py-3">Container Port</th>
                      <th className="px-4 py-3 text-right">Created At</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {deployments.map((dep) => {
                      const isActive = [
                        "QUEUED",
                        "CLONING",
                        "BUILDING",
                        "DEPLOYING",
                        "HEALTH_CHECKING",
                      ].includes(dep.status);
                      return (
                        <tr
                          key={dep.id}
                          className="hover:bg-slate-800/30 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <Badge status={dep.status} />
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-200">
                            {dep.commitSha.substring(0, 7)}
                          </td>
                          <td className="px-4 py-3 text-slate-400">
                            {dep.branch}
                          </td>
                          <td className="px-4 py-3 text-slate-300 font-sans truncate max-w-xs">
                            {dep.commitMessage || "Manual deployment"}
                          </td>
                          <td className="px-4 py-3 text-slate-400">
                            {dep.durationMs
                              ? `${(dep.durationMs / 1000).toFixed(1)}s`
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-indigo-400">
                            {dep.containerPort ? `:${dep.containerPort}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-400">
                            {new Date(dep.createdAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenLogs(dep)}
                                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors text-[11px] inline-flex items-center gap-1"
                                title="View live logs"
                              >
                                <Terminal className="w-3 h-3 text-indigo-400" />
                                Logs
                              </button>
                              {isActive ? (
                                <button
                                  onClick={() => handleCancelDeployment(dep.id)}
                                  disabled={isCancelling}
                                  className="px-2 py-1 rounded bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-300 transition-colors text-[11px] inline-flex items-center gap-1"
                                  title="Cancel active deployment"
                                >
                                  <XCircle className="w-3 h-3 text-rose-400" />
                                  Cancel
                                </button>
                              ) : dep.status === "SUCCEEDED" ? (
                                <button
                                  onClick={() => handleRollbackDeployment(dep)}
                                  disabled={isRollingBack}
                                  className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 text-amber-300 transition-colors text-[11px] inline-flex items-center gap-1"
                                  title="Rollback to this release"
                                >
                                  <RotateCcw className="w-3 h-3 text-amber-400" />
                                  Rollback
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Tab 2: Environment Variables */}
      {activeTab === "env" && (
        <div className="space-y-6">
          {/* Environment Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
              Environment:
            </span>
            <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-lg">
              {project.environments?.map((env) => (
                <button
                  key={env.id}
                  onClick={() => handleSelectEnv(env.id)}
                  className={`px-3 py-1 rounded text-xs font-mono font-medium transition-colors ${
                    selectedEnvId === env.id
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {env.name}
                </button>
              ))}
            </div>
          </div>

          {/* Add Variable Form */}
          <Card
            title="Add Variable"
            description="Encrypted with AES-256-GCM before saving into the database"
          >
            <form
              onSubmit={handleAddEnvVar}
              className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
            >
              <div className="md:col-span-4">
                <Input
                  label="Key"
                  placeholder="e.g. DATABASE_URL"
                  required
                  value={newVarKey}
                  onChange={(e) => setNewVarKey(e.target.value)}
                />
              </div>

              <div className="md:col-span-5">
                <Input
                  label="Value"
                  placeholder="e.g. postgresql://..."
                  required
                  value={newVarValue}
                  onChange={(e) => setNewVarValue(e.target.value)}
                />
              </div>

              <div className="md:col-span-3 flex items-center justify-between gap-3 pb-0.5">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isVarSecret}
                    onChange={(e) => setIsVarSecret(e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Encrypt Secret</span>
                </label>

                <Button
                  type="submit"
                  size="sm"
                  isLoading={isSavingVar}
                  icon={<Plus className="w-3.5 h-3.5" />}
                >
                  Add
                </Button>
              </div>
            </form>
          </Card>

          {/* Variables Table */}
          <Card
            title="Current Variables"
            description="Secrets are strictly masked in client API responses"
            className="p-0 overflow-hidden"
          >
            {envVars.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No environment variables configured for this environment.
              </div>
            ) : (
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800/80">
                  <tr>
                    <th className="px-4 py-3">Variable Key</th>
                    <th className="px-4 py-3">Value</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {envVars.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3 font-semibold text-slate-200">
                        {v.key}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                          {v.value}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {v.isSecret ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                            <Lock className="w-3 h-3" /> Secret
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            Plaintext
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDeleteEnvVar(v.key)}
                          className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                          title="Delete variable"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}

      {/* Tab 3: Settings & Security */}
      {activeTab === "settings" && (
        <div className="space-y-6">
          <Card
            title="Resource Allocation"
            description="Configured container quotas on execution worker"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
                <div className="text-slate-500 mb-1">Memory Limit</div>
                <div className="text-base font-semibold text-white">
                  {project.memoryLimitMb} MB
                </div>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
                <div className="text-slate-500 mb-1">CPU Limit</div>
                <div className="text-base font-semibold text-white">
                  {project.cpuLimit} Cores
                </div>
              </div>
            </div>
          </Card>

          {/* Members Card */}
          <Card
            title="Project Members"
            description="Access control and roles assigned to this project"
          >
            <div className="space-y-2">
              {project.members?.map((m) => (
                <div
                  key={m.userId}
                  className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-800 rounded-lg text-xs"
                >
                  <div>
                    <div className="font-semibold text-white">
                      {m.user.name}
                    </div>
                    <div className="text-slate-400 font-mono text-[11px]">
                      {m.user.email}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-mono text-[11px]">
                    {m.role}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* GitHub & Webhook Configuration */}
          <Card
            title="GitHub & Webhook Automation"
            description="Automatic deployment triggers and repository metadata"
          >
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-1">
                  <div className="text-slate-400 font-medium">
                    Linked Repository
                  </div>
                  <div className="text-white font-mono font-semibold">
                    {project.repositoryFullName || "Custom Git URL"}
                  </div>
                  {project.repositoryId && (
                    <div className="text-[11px] text-slate-500">
                      GitHub Repo ID: {project.repositoryId}
                    </div>
                  )}
                </div>

                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-1">
                  <div className="text-slate-400 font-medium">
                    Auto-Deploy Status
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${
                        project.autoDeployEnabled
                          ? "text-emerald-400"
                          : "text-slate-400"
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      {project.autoDeployEnabled ? "Enabled" : "Disabled"}
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-300 font-mono">
                      branch:{" "}
                      {project.autoDeployBranch || project.defaultBranch}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-semibold">
                    GitHub Webhook Payload URL
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const url = `${window.location.origin}/api/v1/github/webhooks`;
                      navigator.clipboard.writeText(url);
                      setCopiedWebhook(true);
                      setTimeout(() => setCopiedWebhook(false), 2000);
                    }}
                    icon={
                      copiedWebhook ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )
                    }
                  >
                    {copiedWebhook ? "Copied" : "Copy URL"}
                  </Button>
                </div>
                <div className="p-2 bg-slate-900 border border-slate-800 rounded font-mono text-[11px] text-indigo-400 select-all break-all">
                  {typeof window !== "undefined"
                    ? `${window.location.origin}/api/v1/github/webhooks`
                    : "/api/v1/github/webhooks"}
                </div>
                <p className="text-[11px] text-slate-500">
                  Configure this endpoint in your GitHub Repository settings
                  (Settings &gt; Webhooks &gt; Add webhook) with Content type{" "}
                  <code className="text-slate-300">application/json</code> and
                  event{" "}
                  <code className="text-slate-300">Just the push event</code>.
                </p>
              </div>
            </div>
          </Card>

          {/* Danger Zone */}
          <Card
            title="Danger Zone"
            description="Permanently delete this project and all associated deployments"
            className="border-rose-900/40 bg-rose-950/10"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="text-xs text-rose-300">
                Once deleted, this project cannot be recovered.
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setIsDeleteModalOpen(true)}
                icon={<Trash2 className="w-3.5 h-3.5" />}
              >
                Delete Project
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Trigger Deploy Modal */}
      <Modal
        isOpen={isDeployModalOpen}
        onClose={() => setIsDeployModalOpen(false)}
        title="Trigger Deployment"
        description={`Deploy commit to ${project.name} (${project.defaultBranch})`}
      >
        <form onSubmit={handleTriggerDeploy} className="space-y-4">
          {/* Recent GitHub Commits Picker */}
          {isLoadingCommits ? (
            <div className="py-4 flex items-center justify-center gap-2 text-xs text-slate-400">
              <LoadingSpinner size="sm" />
              <span>Fetching latest commits from GitHub...</span>
            </div>
          ) : recentCommits.length > 0 ? (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300 tracking-wider uppercase">
                Select from Recent GitHub Commits
              </label>
              <div className="max-h-48 overflow-y-auto space-y-1.5 p-1 bg-slate-950/50 border border-slate-800 rounded-lg">
                {recentCommits.map((c) => {
                  const isSelected = deployCommitSha === c.sha;
                  return (
                    <div
                      key={c.sha}
                      onClick={() => {
                        setDeployCommitSha(c.sha);
                        setDeployCommitMsg(c.message);
                      }}
                      className={`p-2 rounded border text-xs cursor-pointer transition-all flex items-start justify-between gap-2 ${
                        isSelected
                          ? "bg-indigo-950/40 border-indigo-500/70 text-white"
                          : "bg-slate-900/40 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700 text-slate-300"
                      }`}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-indigo-400 font-semibold">
                            {c.shortSha}
                          </span>
                          <span className="truncate font-medium text-slate-200">
                            {c.message}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {c.author} • {new Date(c.date).toLocaleString()}
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <Input
            label="Git Commit SHA *"
            placeholder="e.g. 7f9a2b1c8e3d..."
            required
            value={deployCommitSha}
            onChange={(e) => setDeployCommitSha(e.target.value)}
            hint="Full or short git commit SHA to check out and build"
          />

          <Input
            label="Commit Message (Optional)"
            placeholder="e.g. Release v1.0.1 hotfix"
            value={deployCommitMsg}
            onChange={(e) => setDeployCommitMsg(e.target.value)}
          />

          <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsDeployModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isDeploying}
              icon={<Play className="w-3.5 h-3.5" />}
            >
              Queue Deployment
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Confirm Project Deletion"
        description={`This action cannot be undone. Type '${project.slug}' to confirm.`}
      >
        <div className="space-y-4">
          <Input
            placeholder={project.slug}
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
          />

          <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={deleteConfirmText !== project.slug}
              isLoading={isDeleting}
              onClick={handleDeleteProject}
              icon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Permanently Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Live Deployment Logs Modal */}
      <Modal
        isOpen={!!activeLogDeployment}
        onClose={() => setActiveLogDeployment(null)}
        title="Deployment Logs"
        description={
          activeLogDeployment
            ? `Deployment ${activeLogDeployment.id.substring(0, 8)} • Commit ${activeLogDeployment.commitSha.substring(0, 7)} (${activeLogDeployment.branch})`
            : ""
        }
        maxWidth="max-w-4xl"
      >
        {activeLogDeployment && (
          <div className="space-y-4">
            {/* Deployment Metadata Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-950/70 border border-slate-800 rounded-lg text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Status:</span>
                <Badge status={activeLogDeployment.status} />
                {activeLogDeployment.containerPort && (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono">
                    Port :{activeLogDeployment.containerPort}
                  </span>
                )}
                {activeLogDeployment.durationMs ? (
                  <span className="text-slate-500 font-mono">
                    {(activeLogDeployment.durationMs / 1000).toFixed(1)}s
                  </span>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                {[
                  "QUEUED",
                  "CLONING",
                  "BUILDING",
                  "DEPLOYING",
                  "HEALTH_CHECKING",
                ].includes(activeLogDeployment.status) && (
                  <Button
                    variant="danger"
                    size="sm"
                    isLoading={isCancelling}
                    onClick={() =>
                      handleCancelDeployment(activeLogDeployment.id)
                    }
                    icon={<XCircle className="w-3.5 h-3.5" />}
                  >
                    Cancel Deployment
                  </Button>
                )}

                {activeLogDeployment.status === "SUCCEEDED" && (
                  <Button
                    variant="outline"
                    size="sm"
                    isLoading={isRollingBack}
                    onClick={() =>
                      handleRollbackDeployment(activeLogDeployment)
                    }
                    icon={<RotateCcw className="w-3.5 h-3.5 text-amber-400" />}
                  >
                    Rollback to this Release
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenLogs(activeLogDeployment)}
                  isLoading={isLoadingLogs}
                  icon={<RefreshCw className="w-3.5 h-3.5" />}
                >
                  Refresh
                </Button>
              </div>
            </div>

            {/* Terminal Window */}
            <div className="bg-slate-950 border border-slate-800 rounded-lg font-mono text-xs overflow-hidden shadow-inner">
              <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-slate-400 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Build & Runtime Stream</span>
                </div>
                <div className="flex items-center gap-2">
                  {[
                    "QUEUED",
                    "CLONING",
                    "BUILDING",
                    "DEPLOYING",
                    "HEALTH_CHECKING",
                  ].includes(activeLogDeployment.status) ? (
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Live streaming from worker...
                    </span>
                  ) : (
                    <span className="text-slate-500">Execution completed</span>
                  )}
                  <span>({activeLogs.length} events)</span>
                </div>
              </div>

              <div className="p-4 max-h-96 overflow-y-auto space-y-1 select-text">
                {activeLogs.length === 0 ? (
                  <div className="text-slate-500 py-8 text-center italic">
                    {isLoadingLogs
                      ? "Fetching deployment logs..."
                      : "No logs recorded for this deployment yet."}
                  </div>
                ) : (
                  activeLogs.map((log) => {
                    const isError = log.level === "ERROR";
                    const isWarn = log.level === "WARN";
                    return (
                      <div
                        key={log.id}
                        className={`leading-relaxed text-[11px] flex items-start gap-2 ${
                          isError
                            ? "text-rose-400 bg-rose-950/20 px-1 rounded"
                            : isWarn
                              ? "text-amber-300 bg-amber-950/20 px-1 rounded"
                              : "text-slate-300"
                        }`}
                      >
                        <span className="text-slate-600 select-none shrink-0">
                          {new Date(log.createdAt).toLocaleTimeString()}
                        </span>
                        {log.step && (
                          <span className="text-indigo-400 font-semibold uppercase text-[10px] shrink-0 bg-indigo-950/50 px-1 py-0.5 rounded border border-indigo-900/50">
                            [{log.step}]
                          </span>
                        )}
                        <span className="break-all whitespace-pre-wrap flex-1">
                          {log.message}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
