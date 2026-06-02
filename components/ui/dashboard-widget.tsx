import * as React from "react";
import { cn } from "@/lib/utils";

interface DashboardWidgetProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function DashboardWidget({
  title,
  subtitle,
  icon,
  action,
  children,
  className,
}: DashboardWidgetProps) {
  return (
    <div className={cn("rounded-xl border bg-card text-card-foreground shadow-sm", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between p-4 pb-0">
          <div className="flex items-start gap-3">
            {icon}
            <div>
              {title && (
                <h3 className="text-base font-semibold leading-none tracking-tight">{title}</h3>
              )}
              {subtitle && (
                <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
              )}
            </div>
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={cn("p-4", !title && "pt-4")}>
        {children}
      </div>
    </div>
  );
}
