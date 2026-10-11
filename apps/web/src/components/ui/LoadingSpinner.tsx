import React from "react";
import { Loader2 } from "lucide-react";

export const LoadingSpinner: React.FC<{
  message?: string;
  size?: "sm" | "md" | "lg";
}> = ({ message, size = "md" }) => {
  const iconSize =
    size === "sm" ? "w-4 h-4" : size === "lg" ? "w-8 h-8" : "w-6 h-6";
  const padding = size === "sm" ? "p-4" : size === "lg" ? "p-16" : "p-8";

  return (
    <div
      className={`flex flex-col items-center justify-center text-slate-400 gap-2 ${padding}`}
    >
      <Loader2 className={`${iconSize} animate-spin text-indigo-500`} />
      {message && (
        <span className="text-xs font-medium tracking-wide uppercase">
          {message}
        </span>
      )}
    </div>
  );
};
