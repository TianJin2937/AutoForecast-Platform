import React, { useState, useCallback } from "react";
import {
  Alert, Box, Button, Container, FormField, Header, Icon, ProgressBar,
  SpaceBetween, Textarea, Wizard,
} from "@cloudscape-design/components";
import { useCreateSession } from "../hooks/useSession";
import { api } from "../lib/api";

interface Props {
  sessionId: string | null;
  onNavigate: (page: "analysis", sessionId: string) => void;
}

const MAX_SIZE = 1024 * 1024 * 1024; // 1 GB

export function UploadPage({ sessionId: existingId, onNavigate }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [context, setContext] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [step, setStep] = useState(0);
  const createSession = useCreateSession();

  const validateFile = (f: File): string | null => {
    if (!f.name.endsWith(".csv")) return "Only CSV files are supported.";
    if (f.size > MAX_SIZE) return `File too large (${(f.size / 1e9).toFixed(2)} GB). Max is 1 GB.`;
    if (f.size === 0) return "File is empty.";
    return null;
  };

  const handleFile = useCallback((f: File) => {
    const err = validateFile(f);
    if (err) { setError(err); return; }
    setError(null);
    setFile(f);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const sid = existingId ?? (await createSession.mutateAsync()).id;
      const { url } = await api.getPresignedUrl(sid, file.name, "text/csv");

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => (xhr.status < 400 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.open("PUT", url);
        xhr.setRequestHeader("Content-Type", "text/csv");
        xhr.send(file);
      });

      onNavigate("analysis", sid);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1e3) return `${bytes} B`;
    if (bytes < 1e6) return `${(bytes / 1e3).toFixed(1)} KB`;
    if (bytes < 1e9) return `${(bytes / 1e6).toFixed(1)} MB`;
    return `${(bytes / 1e9).toFixed(2)} GB`;
  };

  return (
    <Box padding="xl">
      <Wizard
        i18nStrings={{
          stepNumberLabel: (n) => `Step ${n}`,
          collapsedStepsLabel: (n, t) => `Step ${n} of ${t}`,
          submitButton: "Upload & Analyze",
          previousButton: "Back",
          nextButton: "Next",
          cancelButton: "Cancel",
          optional: "optional",
        }}
        activeStepIndex={step}
        onNavigate={({ detail }) => setStep(detail.requestedStepIndex)}
        onSubmit={handleUpload}
        isLoadingNextStep={uploading}
        steps={[
          {
            title: "Select Data",
            description: "Upload a CSV file containing your time series data (up to 1 GB).",
            content: (
              <SpaceBetween size="m">
                {error && <Alert type="error" dismissible onDismiss={() => setError(null)}>{error}</Alert>}
                <FormField label="CSV File">
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById("csv-input")?.click()}
                    style={{
                      border: `2px dashed ${dragOver ? "#0972d3" : file ? "#037f0c" : "#aab7b8"}`,
                      borderRadius: 12,
                      padding: 48,
                      textAlign: "center",
                      cursor: "pointer",
                      background: dragOver ? "#f2f8fd" : file ? "#f2fcf3" : "transparent",
                      transition: "all 0.2s",
                    }}
                  >
                    <input
                      id="csv-input"
                      type="file"
                      accept=".csv"
                      style={{ display: "none" }}
                      onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                    />
                    {file ? (
                      <SpaceBetween size="xs" alignItems="center">
                        <Icon name="status-positive" variant="success" />
                        <Box variant="h4">{file.name}</Box>
                        <Box color="text-body-secondary">{formatSize(file.size)}</Box>
                      </SpaceBetween>
                    ) : (
                      <SpaceBetween size="xs" alignItems="center">
                        <Icon name="upload" size="big" />
                        <Box variant="h4">Drop CSV here or click to browse</Box>
                        <Box color="text-body-secondary">Maximum file size: 1 GB</Box>
                      </SpaceBetween>
                    )}
                  </div>
                </FormField>
              </SpaceBetween>
            ),
          },
          {
            title: "Provide Context",
            isOptional: true,
            description: "Help the AI understand your data better.",
            content: (
              <FormField
                label="Business Context"
                description="Describe your data, what you're forecasting, and any domain knowledge."
              >
                <Textarea
                  value={context}
                  onChange={({ detail }) => setContext(detail.value)}
                  placeholder={`Examples:\n• Daily sales data for 500 SKUs across 3 warehouses, need 30-day forecasts for inventory planning\n• Hourly server metrics (CPU, memory) for capacity planning\n• Monthly revenue by product line, forecasting next quarter`}
                  rows={8}
                />
              </FormField>
            ),
          },
          {
            title: "Review & Upload",
            description: "Confirm your selections and start the analysis.",
            content: (
              <SpaceBetween size="m">
                <Container header={<Header variant="h3">Summary</Header>}>
                  <SpaceBetween size="s">
                    <Box><strong>File:</strong> {file?.name ?? "None selected"}</Box>
                    <Box><strong>Size:</strong> {file ? formatSize(file.size) : "—"}</Box>
                    <Box><strong>Context:</strong> {context || "(none provided)"}</Box>
                  </SpaceBetween>
                </Container>
                {uploading && <ProgressBar value={progress} label="Uploading to S3..." />}
              </SpaceBetween>
            ),
          },
        ]}
      />
    </Box>
  );
}
