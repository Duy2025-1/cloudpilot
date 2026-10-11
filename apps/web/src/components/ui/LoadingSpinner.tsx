import React from "react";
import { Loader2 } from "lucide-react";

export const LoadingSpinner: React.FC<{ message?: string }> = ({
  message = "Loading...",
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-slate-400 gap-3">
      <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      <span className="text-xs font-medium tracking-wide uppercase">
        {message}
      </span>
    </div>
  );
};
