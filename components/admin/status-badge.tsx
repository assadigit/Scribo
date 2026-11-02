"use client";

import { cn } from "@/lib/utils";
import { useI18n } from "@/components/providers";

export type TextStatus = "draft" | "published" | "archived";

/**
 * Rubber-stamp publishing-state mark: draft / published / archived in the
 * distressed stamp face, stamped red ink over the paper. The state is always
 * readable as text (never carried by the mark alone), for screen readers and
 * colorblind users: the label renders inside an sr-only span and the visible
 * stamp is aria-hidden so the badge does not read twice.
 */
export function StatusBadge({
  status,
  className,
}: {
  status: TextStatus;
  className?: string;
}) {
  const { t } = useI18n();
  const label =
    status === "draft"
      ? t.dashStatusDraft
      : status === "published"
        ? t.dashStatusPublished
        : t.dashStatusArchived;

  return (
    <span className={cn("relative inline-block shrink-0", className)}>
      <span aria-hidden="true" className="stamp whitespace-nowrap">
        {label}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}