import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, GitBranch, Globe, Terminal, Plus } from "lucide-react";
import { api } from "../lib/api.js";
import { Button } from "../components/ui/Button.js";
import { Input } from "../components/ui/Input.js";
import { Card } from "../components/ui/Card.js";
import { ErrorAlert } from "../components/ui/ErrorAlert.js";

export const CreateProjectPage: React.FC = () => {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [port, setPort] = useState("3000");
  const [description, setDescription] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        defaultBranch: defaultBranch || "main",
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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
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
            Connect a Git repository to automate deployments with CloudPilot
          </p>
        </div>
      </div>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      <form onSubmit={handleSubmit}>
        <Card className="space-y-5">
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
              hint="Unique identifier used in URLs"
            />
          </div>

          <Input
            label="Git Repository URL *"
            type="url"
            required
            placeholder="https://github.com/owner/repository.git"
            value={repositoryUrl}
            onChange={(e) => setRepositoryUrl(e.target.value)}
            icon={<Globe className="w-4 h-4" />}
            hint="HTTPS Git repository URL ending in .git"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Default Branch"
              placeholder="main"
              value={defaultBranch}
              onChange={(e) => setDefaultBranch(e.target.value)}
              icon={<GitBranch className="w-4 h-4" />}
            />

            <Input
              label="Application Port"
              type="number"
              placeholder="3000"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              icon={<Terminal className="w-4 h-4" />}
              hint="Port your container listens on inside the container"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300 tracking-wider uppercase">
              Description (Optional)
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short overview of what this application does..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
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
