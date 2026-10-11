import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  hint,
  icon,
  className = "",
  id,
  ...props
}) => {
  const inputId =
    id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-semibold text-slate-300 tracking-wider uppercase"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            {icon}
          </div>
        )}
        <input
          id={inputId}
          className={`w-full bg-slate-900 border text-slate-100 text-sm rounded-lg block px-3 py-2 transition-colors placeholder:text-slate-500 focus:outline-none focus:ring-1 ${
            icon ? "pl-9" : ""
          } ${
            error
              ? "border-rose-500/80 focus:border-rose-500 focus:ring-rose-500/30"
              : "border-slate-800 hover:border-slate-700 focus:border-indigo-500 focus:ring-indigo-500/30"
          } ${className}`}
          {...props}
        />
      </div>
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
      {error && <p className="text-xs font-medium text-rose-400">{error}</p>}
    </div>
  );
};
