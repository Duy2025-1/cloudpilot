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
} from "lucide-react";
import { api, Project, EnvVar, Deployment } from "../lib/api.js";
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

  // Delete Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

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
                <span>{project.repositoryUrl.replace(/^https?:\/\//, "")}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <span>•</span>
              <span>Port {project.port}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsDeployModalOpen(true)}
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
                  onClick={() => setIsDeployModalOpen(true)}
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {deployments.map((dep) => (
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
                      </tr>
                    ))}
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
        description={`Deploy commit to ${project.name}`}
      >
        <form onSubmit={handleTriggerDeploy} className="space-y-4">
          <Input
            label="Git Commit SHA *"
            placeholder="e.g. 7f9a2b1c8e3d..."
            required
            value={deployCommitSha}
            onChange={(e) => setDeployCommitSha(e.target.value)}
            hint="Full or short git commit SHA"
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
    </div>
  );
};
