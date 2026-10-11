import React from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { Layers, Terminal, LogOut, Plus, Cloud } from "lucide-react";
import { useAuth } from "../../context/AuthContext.js";
import { Button } from "../ui/Button.js";

export const AppLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const navLinks = [
    {
      to: "/projects",
      label: "Projects",
      icon: <Layers className="w-4 h-4" />,
    },
    {
      to: "/deployments",
      label: "Deployments",
      icon: <Terminal className="w-4 h-4" />,
    },
  ];

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800/80 bg-slate-900/50 flex flex-col shrink-0">
        {/* Brand */}
        <div className="h-16 px-6 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-white block">
                CloudPilot
              </span>
              <span className="text-[10px] text-slate-400 block font-mono">
                v0.1.0-alpha
              </span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
          <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Platform
          </div>
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  isActive ||
                  (link.to === "/projects" && location.pathname === "/")
                    ? "bg-indigo-600/15 text-indigo-400 font-semibold border border-indigo-500/20"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                }`
              }
            >
              {link.icon}
              <span>{link.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User Card */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/80">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="min-w-0">
              <div className="text-xs font-medium text-slate-200 truncate">
                {user?.name}
              </div>
              <div className="text-[11px] text-slate-400 truncate font-mono">
                {user?.email}
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
              {user?.role}
            </span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 text-xs"
            onClick={handleLogout}
            icon={<LogOut className="w-3.5 h-3.5" />}
          >
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-slate-800/80 px-8 flex items-center justify-between bg-slate-900/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <span>Organization</span>
              <span className="text-slate-600">/</span>
              <span className="text-slate-200 font-semibold">Production</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Platform Online</span>
            </div>

            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => navigate("/projects/new")}
            >
              New Project
            </Button>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 overflow-y-auto p-8 bg-slate-950">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
