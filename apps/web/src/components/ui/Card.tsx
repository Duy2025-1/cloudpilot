import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  title,
  description,
  action,
  children,
  className = "",
  ...props
}) => {
  return (
    <div
      className={`bg-slate-900/80 border border-slate-800/80 rounded-xl p-5 shadow-sm backdrop-blur-sm ${className}`}
      {...props}
    >
      {(title || description || action) && (
        <div className="flex items-start justify-between gap-4 mb-4 pb-3 border-b border-slate-800/60">
          <div>
            {title && (
              <h3 className="text-base font-semibold text-slate-100">
                {title}
              </h3>
            )}
            {description && (
              <p className="text-xs text-slate-400 mt-0.5">{description}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
};
