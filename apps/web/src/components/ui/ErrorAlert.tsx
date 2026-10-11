import React from "react";
import { AlertCircle, X } from "lucide-react";

interface ErrorAlertProps {
  message: string;
  onDismiss?: () => void;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({
  message,
  onDismiss,
}) => {
  return (
    <div className="flex items-start gap-3 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-xs">
      <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
      <div className="flex-1 font-medium">{message}</div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-rose-400 hover:text-rose-200 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
