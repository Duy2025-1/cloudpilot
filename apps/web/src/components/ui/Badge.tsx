import React from "react";

type StatusType =
  | "RUNNING"
  | "SUCCESS"
  | "BUILDING"
  | "DEPLOYING"
  | "CLONING"
  | "QUEUED"
  | "HEALTH_CHECKING"
  | "FAILED"
  | "STOPPED"
  | "IDLE"
  | "CANCELLED"
  | "ROLLED_BACK"
  | string;

export interface BadgeProps {
  status?: StatusType;
  children?: React.ReactNode;
  variant?:
    "success" | "danger" | "warning" | "default" | "outline" | "primary";
  size?: "sm" | "md";
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  status,
  children,
  variant,
  size = "md",
  className = "",
}) => {
  const getBadgeStyle = (s?: string, v?: string) => {
    if (v === "success" || s === "RUNNING" || s === "SUCCESS") {
      return {
        bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        dot: "bg-emerald-400",
      };
    }
    if (
      v === "warning" ||
      ["BUILDING", "DEPLOYING", "CLONING", "HEALTH_CHECKING"].includes(s || "")
    ) {
      return {
        bg: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        dot: "bg-amber-400 animate-pulse",
      };
    }
    if (v === "primary" || s === "QUEUED") {
      return {
        bg: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
        dot: "bg-indigo-400",
      };
    }
    if (v === "danger" || s === "FAILED") {
      return {
        bg: "bg-rose-500/10 text-rose-400 border-rose-500/20",
        dot: "bg-rose-400",
      };
    }
    if (v === "outline") {
      return {
        bg: "bg-transparent text-slate-400 border-slate-700",
        dot: "bg-slate-400",
      };
    }
    return {
      bg: "bg-slate-500/10 text-slate-400 border-slate-500/20",
      dot: "bg-slate-400",
    };
  };

  const { bg, dot } = getBadgeStyle(status, variant);
  const sizeClasses =
    size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-mono font-medium border ${sizeClasses} ${bg} ${className}`}
    >
      {status && !children && (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      )}
      {children || status}
    </span>
  );
};
