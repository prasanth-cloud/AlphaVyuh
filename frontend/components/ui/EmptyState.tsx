import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  testId,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void } | { label: string; href: string };
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "64px 24px",
        textAlign: "center",
        minHeight: 280,
      }}
    >
      {Icon && (
        <Icon
          size={32}
          strokeWidth={1.4}
          style={{ color: "var(--text-tertiary)", marginBottom: 14, opacity: 0.7 }}
        />
      )}
      <div
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: "var(--text-primary)",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {description && (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-tertiary)",
            maxWidth: 320,
            lineHeight: 1.6,
            marginBottom: action ? 20 : 0,
          }}
        >
          {description}
        </div>
      )}
      {action && "href" in action && (
        <a
          href={action.href}
          style={{
            padding: "7px 16px",
            borderRadius: 6,
            background: "var(--surface-2)",
            border: "1px solid var(--border-default)",
            fontSize: 12,
            fontWeight: 500,
            color: "var(--text-primary)",
          }}
        >
          {action.label}
        </a>
      )}
      {action && "onClick" in action && (
        <button
          onClick={action.onClick}
          style={{
            padding: "7px 16px",
            borderRadius: 6,
            background: "var(--surface-2)",
            border: "1px solid var(--border-default)",
            fontSize: 12,
            fontWeight: 500,
            color: "var(--text-primary)",
            cursor: "pointer",
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
