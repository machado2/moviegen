import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface NavItem {
  id: string;
  label: string;
  icon?: ReactNode;
}

export interface ProjectShellProps {
  nav: NavItem[];
  active: string;
  onNavigate: (id: string) => void;
  children: ReactNode;
}

/**
 * Project workspace shell: a persistent left rail (pipeline-ordered) plus the
 * active view. Shared by the film and comics apps so navigation is identical.
 */
export function ProjectShell({ nav, active, onNavigate, children }: ProjectShellProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <nav className="flex shrink-0 gap-0.5 overflow-x-auto border-b pb-2 sm:w-48 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r sm:pb-0 sm:pr-2">
        {nav.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            className={cn(
              'flex items-center gap-2 whitespace-nowrap rounded px-3 py-2 text-sm font-medium transition-colors',
              active === item.id
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

export default ProjectShell;
