"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/portal/types";

interface SidebarNavProps {
  items: NavItem[];
  collapsed: boolean;
}

export function SidebarNav({ items, collapsed }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 py-2 overflow-auto">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
              isActive
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
            title={collapsed ? item.label : undefined}
          >
            <span className="w-5 h-5 shrink-0 text-center">{getIconChar(item.icon)}</span>
            {!collapsed && <span>{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function getIconChar(iconName: string): string {
  const icons: Record<string, string> = {
    "layout-dashboard": "◻",
    "building-2": "🏢",
    "users": "👥",
    "settings": "⚙",
    "graduation-cap": "🎓",
    "book-open": "📖",
    "school": "🏫",
    "calendar": "📅",
    "bar-chart-3": "📊",
    "code": "⌨",
    "help-circle": "❓",
    "file-text": "📄",
  };
  return icons[iconName] || "•";
}
