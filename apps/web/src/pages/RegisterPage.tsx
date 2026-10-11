import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Cloud, Lock, Mail, User as UserIcon, ArrowRight } from "lucide-react";
import { useAuth } from "../context/AuthContext.js";
import { Button } from "../components/ui/Button.js";
import { Input } from "../components/ui/Input.js";
import { ErrorAlert } from "../components/ui/ErrorAlert.js";

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Password requirements checks
  const hasMinLength = password.length >= 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const isPasswordValid =
    hasMinLength && hasUpperCase && hasLowerCase && hasNumber;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name || !email || !password) {
      setError("All fields are required");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!isPasswordValid) {
      setError("Password does not meet the security requirements");
      return;
    }

    setIsLoading(true);
    try {
      await register({ name, email, password });
      navigate("/projects", { replace: true });
    } catch (err: any) {
      setError(err.message || "Failed to create account");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mx-auto shadow-lg mb-4">
          <Cloud className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Create CloudPilot Account
        </h1>
        <p className="mt-1.5 text-xs text-slate-400">
          Start deploying your containerized applications in minutes
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
              label="Full Name"
              type="text"
              required
              placeholder="Alex Johnson"
              value={name}
              onChange={(e) => setName(e.target.value)}
              icon={<UserIcon className="w-4 h-4" />}
            />

            <Input
              label="Email address"
              type="email"
              autoComplete="email"
              required
              placeholder="alex@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail className="w-4 h-4" />}
            />

            <Input
              label="Password"
              type="password"
              autoComplete="new-password"
              required
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<Lock className="w-4 h-4" />}
            />

            {/* Password checklist */}
            <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg space-y-1.5 text-[11px] font-mono">
              <div className="flex items-center gap-1.5 text-slate-400">
                <span
                  className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${hasMinLength ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800 text-slate-500"}`}
                >
                  ✓
                </span>
                <span className={hasMinLength ? "text-emerald-400" : ""}>
                  At least 8 characters
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <span
                  className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${hasUpperCase && hasLowerCase ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800 text-slate-500"}`}
                >
                  ✓
                </span>
                <span
                  className={
                    hasUpperCase && hasLowerCase ? "text-emerald-400" : ""
                  }
                >
                  Upper & lowercase letters
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <span
                  className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${hasNumber ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800 text-slate-500"}`}
                >
                  ✓
                </span>
                <span className={hasNumber ? "text-emerald-400" : ""}>
                  At least one number
                </span>
              </div>
            </div>

            <Input
              label="Confirm Password"
              type="password"
              autoComplete="new-password"
              required
              placeholder="••••••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              icon={<Lock className="w-4 h-4" />}
            />

            <Button
              type="submit"
              className="w-full mt-3"
              isLoading={isLoading}
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Create Account
            </Button>
          </form>

          <div className="mt-6 text-center text-xs text-slate-400">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Sign in instead
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
