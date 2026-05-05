import type { WorkflowState } from "@/lib/api";

export function workflowPlanStatus(plan: WorkflowState | null) {
  if (!plan) return { valid: false, next: "Create a plan before drafting an order." };
  if (!plan.entry || plan.entry <= 0) return { valid: false, next: "Complete entry." };
  if (!plan.stop || plan.stop <= 0) return { valid: false, next: "Complete stop." };
  if (!plan.target || plan.target <= 0) return { valid: false, next: "Complete target." };
  if (plan.entry <= plan.stop) return { valid: false, next: "Entry must be above stop for a long swing plan." };
  if (plan.target <= plan.entry) return { valid: false, next: "Target must be above entry." };
  if (!plan.position_size || plan.position_size <= 0) return { valid: false, next: "Complete position size." };
  if (!plan.thesis?.trim()) return { valid: false, next: "Complete thesis." };
  if (!plan.invalidation_rule?.trim()) return { valid: false, next: "Complete invalidation rule." };
  return { valid: true, next: "Ready for order draft." };
}
