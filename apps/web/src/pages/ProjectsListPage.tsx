import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Layers,
  Plus,
  GitBranch,
  RefreshCw,
  FolderCode,
  Clock,
  Radio,
} from "lucide-react";
import { api, Project } from "../lib/api.js";
import { Button } from "../components/ui/Button.js";
import { Badge } from "../components/ui/Badge.js";
import { Card } from "../components/ui/Card.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { LoadingSpinner } from "../components/ui/LoadingSpinner.js";
import { ErrorAlert } from "../components/ui/ErrorAlert.js";

export const ProjectsListPage: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.projects.list();
      setProjects(data);
    } catch (err: any) {
      setError(err.message || "Failed to fetch projects");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const runningCount = projects.filter((p) => p.status === "RUNNING").length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner & Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Projects Dashboard
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage, configure, and monitor your containerized services
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchProjects}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate("/projects/new")}
            icon={<Plus className="w-4 h-4" />}
          >
            Create Project
          </Button>
        </div>
      </div>

      {/* Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-400">
              Total Projects
            </div>
            <div className="text-2xl font-bold font-mono text-white mt-0.5">
              {projects.length}
            </div>
          </div>
        </Card>

        <Card className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-400">
              Running Services
            </div>
            <div className="text-2xl font-bold font-mono text-white mt-0.5">
              {runningCount}
            </div>
          </div>
        </Card>

        <Card className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-400">
              Total Deployments
            </div>
            <div className="text-2xl font-bold font-mono text-white mt-0.5">
              {projects.reduce(
                (acc, p) => acc + (p._count?.deployments || 0),
                0,
              )}
            </div>
          </div>
        </Card>
      </div>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {/* Content State */}
      {isLoading ? (
        <LoadingSpinner message="Loading projects..." />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<FolderCode className="w-6 h-6" />}
          title="No projects configured"
          description="Get started by connecting a Git repository and deploying your first containerized application."
          action={
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate("/projects/new")}
              icon={<Plus className="w-4 h-4" />}
            >
              Create Project
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.slug}`}
              className="group block"
            >
              <Card className="h-full hover:border-slate-700 transition-all hover:shadow-md hover:bg-slate-900/90 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h2 className="text-sm font-semibold text-white group-hover:text-indigo-400 transition-colors truncate">
                      {project.name}
                    </h2>
                    <Badge status={project.status} />
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2 mb-4">
                    {project.description || "No description provided"}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-800/80 space-y-2 text-[11px] font-mono text-slate-400">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 truncate">
                      <GitBranch className="w-3.5 h-3.5 text-slate-500" />
                      <span>{project.defaultBranch}</span>
                    </span>
                    <span className="text-slate-500">Port {project.port}</span>
                  </div>

                  <div className="flex items-center justify-between text-slate-500">
                    <span>
                      {project.environments?.length || 2} Environments
                    </span>
                    <span>
                      {new Date(project.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
