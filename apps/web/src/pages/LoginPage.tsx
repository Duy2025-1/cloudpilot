import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Cloud, Lock, Mail, ArrowRight } from "lucide-react";
import { useAuth } from "../context/AuthContext.js";
import { Button } from "../components/ui/Button.js";
import { Input } from "../components/ui/Input.js";
import { ErrorAlert } from "../components/ui/ErrorAlert.js";

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const from = (location.state as any)?.from?.pathname || "/projects";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Please provide both email and password");
      return;
    }

    setIsLoading(true);
    try {
      await login({ email, password });
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.message || "Invalid email or password");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoAutofill = (role: "admin" | "dev") => {
    if (role === "admin") {
      setEmail("admin@cloudpilot.local");
      setPassword("Admin123!@#");
    } else {
      setEmail("dev@cloudpilot.local");
      setPassword("Dev123!@#");
    }
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mx-auto shadow-lg mb-4">
          <Cloud className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Sign in to CloudPilot
        </h1>
        <p className="mt-1.5 text-xs text-slate-400">
          Automated web application deployment and cloud platform
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-slate-900 border border-slate-800 py-8 px-6 shadow-2xl rounded-2xl sm:px-10">
          {error && (
            <div className="mb-5">
              <ErrorAlert message={error} onDismiss={() => setError(null)} />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email address"
              type="email"
              autoComplete="email"
              required
              placeholder="developer@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail className="w-4 h-4" />}
            />

            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<Lock className="w-4 h-4" />}
            />

            <Button
              type="submit"
              className="w-full mt-2"
              isLoading={isLoading}
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Sign In
            </Button>
          </form>

          {/* Quick Demo Autofill */}
          <div className="mt-6 pt-5 border-t border-slate-800/80">
            <div className="text-[11px] font-medium text-slate-400 mb-2 uppercase tracking-wider text-center">
              Quick Local Test Accounts
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleDemoAutofill("admin")}
                className="px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-950/60 hover:bg-slate-800 text-[11px] font-mono text-slate-300 transition-colors text-center"
              >
                Admin Account
              </button>
              <button
                type="button"
                onClick={() => handleDemoAutofill("dev")}
                className="px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-950/60 hover:bg-slate-800 text-[11px] font-mono text-slate-300 transition-colors text-center"
              >
                Dev Account
              </button>
            </div>
          </div>

          <div className="mt-6 text-center text-xs text-slate-400">
            Don't have an account?{" "}
            <Link
              to="/register"
              className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Create one now
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
