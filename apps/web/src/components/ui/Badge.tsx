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

interface BadgeProps {
  status: StatusType;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ status, className = "" }) => {
  const getBadgeStyle = (s: string) => {
    switch (s) {
      case "RUNNING":
      case "SUCCESS":
        return {
          bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
          dot: "bg-emerald-400",
        };
      case "BUILDING":
      case "DEPLOYING":
      case "CLONING":
      case "HEALTH_CHECKING":
        return {
          bg: "bg-amber-500/10 text-amber-400 border-amber-500/20",
          dot: "bg-amber-400 animate-pulse",
        };
      case "QUEUED":
        return {
          bg: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
          dot: "bg-indigo-400",
        };
      case "FAILED":
        return {
          bg: "bg-rose-500/10 text-rose-400 border-rose-500/20",
          dot: "bg-rose-400",
        };
      case "STOPPED":
      case "CANCELLED":
      case "ROLLED_BACK":
      case "IDLE":
      default:
        return {
          bg: "bg-slate-500/10 text-slate-400 border-slate-500/20",
          dot: "bg-slate-400",
        };
    }
  };

  const { bg, dot } = getBadgeStyle(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium border ${bg} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      <span>{status}</span>
    </span>
  );
};
