import React, { useEffect, useState } from "react";
import {
  Box, Container, Header, ProgressBar, SpaceBetween, StatusIndicator, Alert,
} from "@cloudscape-design/components";
import { useSession } from "../hooks/useSession";

interface Props {
  sessionId: string;
  onNavigate: (page: "results", sessionId: string) => void;
}

const STEPS = [
  { label: "Generating forecast code", duration: "~30s" },
  { label: "Validating code", duration: "~2-10 min" },
  { label: "Running full forecast", duration: "~5-15 min" },
  { label: "Producing results", duration: "~30s" },
];

export function RunningPage({ sessionId, onNavigate }: Props) {
  const { data: session } = useSession(sessionId);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (session?.status === "COMPLETED") onNavigate("results", sessionId);
  }, [session?.status, sessionId, onNavigate]);

  const startTime = session?.runStartedAt ? new Date(session.runStartedAt).getTime() : null;
  const elapsed = startTime ? Math.max(0, Math.floor((now - startTime) / 1000)) : 0;
  const currentStep = session?.runStep ?? 0;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  const stepType = (i: number): "success" | "loading" | "pending" => {
    if (i < currentStep) return "success";
    if (i === currentStep) return "loading";
    return "pending";
  };

  return (
    <Box padding="xl">
      <SpaceBetween size="l">
        <Header variant="h1" description={`Session ${sessionId.slice(0, 8)}`}>
          Running Forecast
        </Header>

        {session?.status === "FAILED" && (
          <Alert type="error" header="Forecast Failed">
            The SageMaker processing job failed. Check CloudWatch logs for details.
          </Alert>
        )}

        <Container header={<Header variant="h2">Progress</Header>}>
          <SpaceBetween size="l">
            <ProgressBar
              status={session?.status === "FAILED" ? "error" : "in-progress"}
              value={Math.min(100, (currentStep / STEPS.length) * 100)}
              label="Forecast Pipeline"
              description={`Elapsed: ${formatTime(elapsed)}`}
            />

            <SpaceBetween size="s">
              {STEPS.map((step, i) => (
                <Box key={i}>
                  <StatusIndicator type={stepType(i)}>
                    {step.label} <Box variant="small" display="inline" color="text-body-secondary">({step.duration})</Box>
                  </StatusIndicator>
                </Box>
              ))}
            </SpaceBetween>

            {session?.forecastJobId && (
              <Box variant="small" color="text-body-secondary">
                Job ID: <code>{session.forecastJobId}</code>
              </Box>
            )}
          </SpaceBetween>
        </Container>
      </SpaceBetween>
    </Box>
  );
}
