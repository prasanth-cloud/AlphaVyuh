import { describe, expect, it } from "vitest";
import {
  agentBlockers,
  agentLanes,
  agentRequests,
  agentStatusTone,
  shippedAgentPrs,
  validateMissionControlData,
} from "../../lib/agentMissionControl";

describe("agent mission control data", () => {
  it("keeps agent rows complete and uniquely keyed", () => {
    expect(validateMissionControlData()).toBe(true);
    expect(new Set(agentLanes.map((agent) => agent.id)).size).toBe(agentLanes.length);
    expect(agentLanes.map((agent) => agent.name)).toEqual(
      expect.arrayContaining(["Manager", "Feature", "Data", "QA", "Security", "Deploy"]),
    );
  });

  it("uses internal statuses and safe public PR links", () => {
    for (const agent of agentLanes) {
      expect(["active", "watching", "blocked", "ready"]).toContain(agent.status);
      expect(agentStatusTone(agent.status)).toMatch(/^var\(--/);
    }

    for (const pr of shippedAgentPrs) {
      expect(pr.href).toMatch(/^https:\/\/github\.com\/prasanth-cloud\/AlphaVyuh\/pull\/\d+$/);
      expect(pr.productImpact.trim().length).toBeGreaterThan(12);
    }

    for (const blocker of agentBlockers) {
      expect(blocker.productImpact.trim().length).toBeGreaterThan(12);
    }
  });

  it("tracks blockers and cross-agent requests without secret-shaped fields", () => {
    expect(agentBlockers.length).toBeGreaterThan(0);
    expect(agentRequests.length).toBeGreaterThan(0);
    const serialized = JSON.stringify({ agentBlockers, agentRequests });
    expect(serialized).not.toMatch(/SERVICE_ROLE|ACCESS_TOKEN|SECRET|PASSWORD/i);
  });
});
