import React from "react";
import {
  Box, Button, Cards, Container, Header, SpaceBetween, StatusIndicator,
} from "@cloudscape-design/components";
import { useSessions, useCreateSession } from "../hooks/useSession";
import type { Session, SessionStatus } from "../lib/types";

interface Props {
  onNavigate: (page: "upload" | "analysis" | "running" | "results", sessionId: string) => void;
}

const STATUS_MAP: Record<SessionStatus, { type: "success" | "info" | "loading" | "error" | "warning"; label: string }> = {
  CREATED: { type: "info", label: "Created" },
  UPLOADING: { type: "loading", label: "Uploading" },
  PROFILING: { type: "loading", label: "Profiling" },
  REVIEWING: { type: "warning", label: "Awaiting Review" },
  APPROVED: { type: "info", label: "Approved" },
  RUNNING: { type: "loading", label: "Running" },
  COMPLETED: { type: "success", label: "Completed" },
  FAILED: { type: "error", label: "Failed" },
};

function getPageForStatus(status: SessionStatus): "upload" | "analysis" | "running" | "results" {
  switch (status) {
    case "CREATED": case "UPLOADING": return "upload";
    case "PROFILING": case "REVIEWING": return "analysis";
    case "APPROVED": case "RUNNING": return "running";
    case "COMPLETED": case "FAILED": return "results";
  }
}

export function HomePage({ onNavigate }: Props) {
  const { data: sessions = [], isLoading } = useSessions();
  const createSession = useCreateSession();

  const handleNew = async () => {
    const session = await createSession.mutateAsync();
    onNavigate("upload", session.id);
  };

  return (
    <Box padding="xl">
      <SpaceBetween size="xl">
        <Header
          variant="h1"
          description="AI-powered time series forecasting — upload data, review the AI's analysis, and get production-quality forecasts."
          actions={
            <Button variant="primary" onClick={handleNew} loading={createSession.isPending} iconName="add-plus">
              New Forecast
            </Button>
          }
        >
          AutoForecast
        </Header>

        <Cards
          loading={isLoading}
          loadingText="Loading sessions..."
          empty={
            <Box textAlign="center" padding="xxl" color="text-body-secondary">
              <SpaceBetween size="m">
                <b>No forecasts yet</b>
                <Box>Click "New Forecast" to get started.</Box>
              </SpaceBetween>
            </Box>
          }
          cardDefinition={{
            header: (item: Session) => (
              <Button variant="link" onClick={() => onNavigate(getPageForStatus(item.status), item.id)}>
                Session {item.id.slice(0, 8)}
              </Button>
            ),
            sections: [
              {
                id: "status",
                header: "Status",
                content: (item: Session) => {
                  const s = STATUS_MAP[item.status];
                  return <StatusIndicator type={s.type}>{s.label}</StatusIndicator>;
                },
              },
              {
                id: "created",
                header: "Created",
                content: (item: Session) => new Date(item.createdAt).toLocaleString(),
              },
              {
                id: "data",
                header: "Data",
                content: (item: Session) => item.dataKey?.split("/").pop() ?? "—",
              },
            ],
          }}
          items={sessions}
          header={<Header counter={`(${sessions.length})`}>Recent Forecasts</Header>}
        />
      </SpaceBetween>
    </Box>
  );
}
