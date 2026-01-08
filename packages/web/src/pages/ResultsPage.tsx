import React, { useState, useEffect } from "react";
import {
  Box, Button, ColumnLayout, Container, Header, Link, SpaceBetween,
  StatusIndicator, Table, Tabs, Alert, Spinner,
} from "@cloudscape-design/components";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { BacktestMetrics, ForecastResults } from "../lib/types";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  sessionId: string;
  onNavigate: (page: "home") => void;
}

export function ResultsPage({ sessionId, onNavigate }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["results", sessionId],
    queryFn: () => api.getResults(sessionId),
  });

  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    if (!data?.urls?.backtestMetrics) return;
    fetch(data.urls.backtestMetrics)
      .then((r) => r.json())
      .then(setMetrics)
      .catch(() => {});
  }, [data?.urls?.backtestMetrics]);

  if (isLoading) return <Box padding="xl"><Spinner size="large" /> Loading results...</Box>;
  if (error) return <Box padding="xl"><Alert type="error">Failed to load results: {(error as Error).message}</Alert></Box>;

  const urls = data?.urls ?? ({} as Partial<ForecastResults["urls"]>);

  // Handle both formats: {leaderboard: [...]} (AutoGluon) and {byModel: {...}} (legacy)
  const metricsRows = metrics?.leaderboard
    ? metrics.leaderboard.map((m: any) => ({
        model: m.model,
        score: Math.abs(m.score_test),
        fitTime: m.fit_time_marginal?.toFixed(1),
        predTime: m.pred_time_test?.toFixed(1),
      }))
    : metrics?.byModel
      ? Object.entries(metrics.byModel).map(([model, m]: [string, any]) => ({ model, ...m }))
      : [];

  return (
    <Box padding="xl">
      <SpaceBetween size="l">
        <Header
          variant="h1"
          description={`Session ${sessionId.slice(0, 8)}`}
          actions={
            <SpaceBetween size="s" direction="horizontal">
              <Button onClick={() => onNavigate("home")}>Back to Home</Button>
              <Button variant="primary" onClick={() => onNavigate("home")} iconName="add-plus">
                New Forecast
              </Button>
            </SpaceBetween>
          }
        >
          <StatusIndicator type="success">Forecast Complete</StatusIndicator>
        </Header>

        <Tabs
          tabs={[
            {
              id: "overview",
              label: "Overview",
              content: (
                <SpaceBetween size="l">
                  {data?.session?.context && (
                    <Container header={<Header variant="h2">User Context</Header>}>
                      <Box variant="p">{data.session.context}</Box>
                    </Container>
                  )}
                  {data?.session?.hypothesis && (
                    <Container header={<Header variant="h2">Data Analysis &amp; Forecast Plan</Header>}>
                      <div className="markdown-content">
                        <Markdown remarkPlugins={[remarkGfm]}>{data.session.hypothesis}</Markdown>
                      </div>
                    </Container>
                  )}
                </SpaceBetween>
              ),
            },
            {
              id: "forecast",
              label: "Forecast",
              content: (
                <Container header={<Header variant="h2">Forecast Plot</Header>}>
                  {urls.forecastPlot ? (
                    <iframe
                      src={urls.forecastPlot}
                      style={{ width: "100%", height: 550, border: "none", borderRadius: 8 }}
                      title="Forecast"
                    />
                  ) : (
                    <Box textAlign="center" padding="xxl" color="text-body-secondary">
                      No forecast plot available
                    </Box>
                  )}
                </Container>
              ),
            },
            {
              id: "backtest",
              label: "Backtest",
              content: (
                <SpaceBetween size="l">
                  <Container header={<Header variant="h2">Backtest Plot</Header>}>
                    {urls.backtestPlot ? (
                      <iframe
                        src={urls.backtestPlot}
                        style={{ width: "100%", height: 550, border: "none", borderRadius: 8 }}
                        title="Backtest"
                      />
                    ) : (
                      <Box textAlign="center" padding="xxl" color="text-body-secondary">
                        No backtest plot available
                      </Box>
                    )}
                  </Container>

                  {metrics && (
                    <Container header={<Header variant="h2">Overall Metrics</Header>}>
                      <ColumnLayout columns={3} variant="text-grid">
                        <div>
                          <Box variant="awsui-key-label">Eval Metric</Box>
                          <Box variant="h1">{metrics.eval_metric ?? "WAPE"}</Box>
                        </div>
                        <div>
                          <Box variant="awsui-key-label">Best Model</Box>
                          <Box variant="h1">{metrics.best_model ?? "—"}</Box>
                        </div>
                        <div>
                          <Box variant="awsui-key-label">Best Score</Box>
                          <Box variant="h1">{metricsRows[0]?.score?.toFixed(3) ?? "—"}</Box>
                        </div>
                      </ColumnLayout>
                    </Container>
                  )}

                  {metricsRows.length > 0 && (
                    <Table
                      header={<Header variant="h2">Model Comparison</Header>}
                      columnDefinitions={[
                        { id: "model", header: "Model", cell: (r: any) => <strong>{r.model}</strong> },
                        { id: "score", header: metrics?.eval_metric ?? "Score", cell: (r: any) => r.score?.toFixed(3) },
                        { id: "fitTime", header: "Fit Time (s)", cell: (r: any) => r.fitTime ?? "—" },
                        { id: "predTime", header: "Predict Time (s)", cell: (r: any) => r.predTime ?? "—" },
                      ]}
                      items={metricsRows}
                      sortingDisabled
                      variant="embedded"
                    />
                  )}
                </SpaceBetween>
              ),
            },
            {
              id: "downloads",
              label: "Downloads",
              content: (
                <Container header={<Header variant="h2">Download Artifacts</Header>}>
                  <ColumnLayout columns={2}>
                    {urls.forecastCsv && (
                      <Link href={urls.forecastCsv} external fontSize="heading-m">
                        📊 Forecast CSV
                      </Link>
                    )}
                    {urls.backtestMetrics && (
                      <Link href={urls.backtestMetrics} external fontSize="heading-m">
                        📈 Backtest Metrics (JSON)
                      </Link>
                    )}
                    {urls.generatedCode && (
                      <Link href={urls.generatedCode} external fontSize="heading-m">
                        🐍 Generated Python Code
                      </Link>
                    )}
                    {urls.forecastPlot && (
                      <Link href={urls.forecastPlot} external fontSize="heading-m">
                        📉 Forecast Plot (HTML)
                      </Link>
                    )}
                    {urls.backtestPlot && (
                      <Link href={urls.backtestPlot} external fontSize="heading-m">
                        📊 Backtest Plot (HTML)
                      </Link>
                    )}
                  </ColumnLayout>
                </Container>
              ),
            },
          ]}
        />
      </SpaceBetween>
    </Box>
  );
}
