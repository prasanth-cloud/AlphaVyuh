"use client";

import Link from "next/link";
import {
  agentBlockers,
  agentLanes,
  agentRequests,
  agentStatusTone,
  nextAgentActions,
  shippedAgentPrs,
} from "@/lib/agentMissionControl";
import { Card, DataTable, DataTableHead, EmptyState, EyebrowLabel, Num, Td, Th, Tr } from "@/components/ui";

function StatusPill({ label, tone }: { label: string; tone: string }) {
  return (
    <span className="workspace-pill" style={{ color: tone }}>
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: tone,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}

export default function AgentMissionControlPage() {
  const activeCount = agentLanes.filter((agent) => agent.status === "active").length;
  const blockedCount = agentBlockers.length;
  const requestCount = agentRequests.length;

  return (
    <div className="workspace-page" data-testid="agent-mission-control">
      <div className="workspace-toolbar" style={{ alignItems: "flex-start" }}>
        <div>
          <EyebrowLabel>Agent operating system</EyebrowLabel>
          <h1 style={{ margin: "6px 0 4px", fontSize: 22, letterSpacing: 0 }}>Mission control</h1>
          <p className="caption" style={{ maxWidth: 760 }}>
            Founder view for agent work: what is active, what shipped, what is blocked, and what should happen next.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <StatusPill label={`${activeCount} active`} tone="var(--gain)" />
          <StatusPill label={`${blockedCount} blockers`} tone="var(--loss)" />
          <StatusPill label={`${requestCount} request`} tone="var(--warn)" />
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {agentLanes.map((agent) => (
          <Card key={agent.id} padding="md">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div className="label" style={{ marginBottom: 6 }}>{agent.scope}</div>
                <h2 className="heading-card" style={{ marginBottom: 4 }}>{agent.name}</h2>
              </div>
              <StatusPill label={agent.status} tone={agentStatusTone(agent.status)} />
            </div>
            <p style={{ margin: "10px 0 12px", color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.45 }}>
              {agent.currentWork}
            </p>
            <div className="caption" style={{ display: "grid", gap: 4 }}>
              <span><strong style={{ color: "var(--text-secondary)" }}>Autonomy:</strong> {agent.autonomy}</span>
              <span><strong style={{ color: "var(--text-secondary)" }}>Owner files:</strong> {agent.ownerFiles}</span>
              <span><strong style={{ color: "var(--text-secondary)" }}>Last update:</strong> <Num>{agent.lastUpdate}</Num></span>
            </div>
          </Card>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(320px, 0.85fr)", gap: 16 }}>
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <Card padding="md">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <div>
                <EyebrowLabel>Recently shipped</EyebrowLabel>
                <h2 className="heading-card" style={{ marginTop: 4 }}>PRs landed by agents</h2>
              </div>
              <Link className="workspace-chip-button" href="https://github.com/prasanth-cloud/AlphaVyuh/pulls?q=is%3Apr+is%3Amerged">
                GitHub PRs
              </Link>
            </div>
            {shippedAgentPrs.length === 0 ? (
              <EmptyState title="No shipped PRs recorded yet." description="Merged agent-built work will appear here." />
            ) : (
              <DataTable>
                <DataTableHead>
                  <Th>PR</Th>
                  <Th>Title</Th>
                  <Th>Agent</Th>
                  <Th>Merged</Th>
                  <Th>Notes</Th>
                </DataTableHead>
                <tbody>
                  {shippedAgentPrs.map((pr) => (
                    <Tr key={pr.pr}>
                      <Td mono emphasized><Link href={pr.href}>{pr.pr}</Link></Td>
                      <Td emphasized>{pr.title}</Td>
                      <Td>{pr.agent}</Td>
                      <Td mono>{pr.merged}</Td>
                      <Td>{pr.notes}</Td>
                    </Tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </Card>

          <Card padding="md">
            <EyebrowLabel>Launch blockers</EyebrowLabel>
            <h2 className="heading-card" style={{ margin: "4px 0 12px" }}>Owner and system gates</h2>
            <DataTable>
              <DataTableHead>
                <Th>Severity</Th>
                <Th>Blocker</Th>
                <Th>Owner</Th>
                <Th>Next move</Th>
              </DataTableHead>
              <tbody>
                {agentBlockers.map((blocker) => (
                  <Tr key={blocker.blocker}>
                    <Td mono emphasized>{blocker.severity}</Td>
                    <Td emphasized>{blocker.blocker}</Td>
                    <Td>{blocker.owner}</Td>
                    <Td>{blocker.nextMove}</Td>
                  </Tr>
                ))}
              </tbody>
            </DataTable>
          </Card>
        </div>

        <aside style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <Card padding="md">
            <EyebrowLabel>Cross-agent requests</EyebrowLabel>
            <h2 className="heading-card" style={{ margin: "4px 0 12px" }}>Waiting on another agent</h2>
            {agentRequests.length === 0 ? (
              <EmptyState title="No open requests." description="Cross-agent dependencies will appear here." />
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {agentRequests.map((request) => (
                  <div
                    key={request.id}
                    style={{
                      padding: 12,
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-md)",
                      background: "rgba(255,255,255,0.025)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                      <Num style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{request.id}</Num>
                      <StatusPill label={request.status} tone="var(--warn)" />
                    </div>
                    <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.45 }}>{request.request}</p>
                    <div className="caption" style={{ marginTop: 8 }}>{request.from} to {request.to}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card padding="md">
            <EyebrowLabel>Next actions</EyebrowLabel>
            <h2 className="heading-card" style={{ margin: "4px 0 12px" }}>Queue discipline</h2>
            <div style={{ display: "grid", gap: 8 }}>
              {nextAgentActions.map((action, index) => (
                <div
                  key={action}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "28px 1fr",
                    gap: 10,
                    alignItems: "start",
                    padding: "10px 0",
                    borderBottom: index < nextAgentActions.length - 1 ? "1px solid var(--border-subtle)" : "none",
                  }}
                >
                  <Num style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{String(index + 1).padStart(2, "0")}</Num>
                  <span style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.45 }}>{action}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card padding="md">
            <EyebrowLabel>Guardrails</EyebrowLabel>
            <h2 className="heading-card" style={{ margin: "4px 0 10px" }}>Human approval stays explicit</h2>
            <p className="caption" style={{ lineHeight: 1.55 }}>
              Agents can branch, implement, test, open PRs, and summarize. Production database changes, broker validation,
              billing enablement, and paid-launch positioning stay owner-controlled.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
