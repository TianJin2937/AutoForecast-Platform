import React, { useState, useEffect, useRef } from "react";
import {
  Box, Button, ColumnLayout, Container, Header, SpaceBetween,
  StatusIndicator, Textarea, Alert,
} from "@cloudscape-design/components";
import { useSession } from "../hooks/useSession";
import { api } from "../lib/api";
import type { ChatMessage } from "../lib/types";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  sessionId: string;
  onNavigate: (page: "running", sessionId: string) => void;
}

export function AnalysisPage({ sessionId, onNavigate }: Props) {
  const { data: session } = useSession(sessionId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [approving, setApproving] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (analyzed || !session?.dataKey) return;
    setAnalyzed(true);
    // If session already has a hypothesis (REVIEWING status), show it instead of re-analyzing
    if (session.hypothesis) {
      setMessages([{ role: "assistant", content: session.hypothesis, timestamp: session.updatedAt || new Date().toISOString() }]);
      return;
    }
    setLoading(true);
    api.analyze(sessionId, session.context).then((result) => {
      setMessages([{ role: "assistant", content: result.hypothesis, timestamp: new Date().toISOString() }]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [sessionId, session, analyzed]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const feedback = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: feedback, timestamp: new Date().toISOString() }]);
    setLoading(true);
    try {
      const result = await api.refine(sessionId, feedback);
      setMessages((prev) => [...prev, { role: "assistant", content: result.hypothesis, timestamp: new Date().toISOString() }]);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      await api.approve(sessionId);
      await api.runForecast(sessionId);
      onNavigate("running", sessionId);
    } catch {
      setApproving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <Box padding="xl">
      <SpaceBetween size="l">
        <Header variant="h1" description={`Session ${sessionId.slice(0, 8)}`}
          actions={
            <Button onClick={handleApprove} variant="primary" loading={approving} disabled={loading || messages.length === 0}>
              ✅ Approve & Run Forecast
            </Button>
          }
        >
          Data Analysis
        </Header>

        {session?.context && <Alert type="info" header="Your Context">{session.context}</Alert>}

        <Container header={<Header variant="h2">AI Analysis</Header>}>
          <div style={{ maxHeight: 600, overflowY: "auto", padding: 4 }}>
            <SpaceBetween size="m">
              {messages.map((m, i) => (
                <div key={i} style={{
                  padding: 16, borderRadius: 12,
                  background: m.role === "assistant" ? "#f2f8fd" : "#e9ebed",
                  borderLeft: m.role === "assistant" ? "4px solid #0972d3" : "4px solid #879596",
                }}>
                  <Box variant="small" color="text-body-secondary" margin={{ bottom: "xs" }}>
                    {m.role === "assistant" ? "🤖 AutoForecast AI" : "👤 You"} · {new Date(m.timestamp).toLocaleTimeString()}
                  </Box>
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                    {m.role === "assistant"
                      ? <Markdown remarkPlugins={[remarkGfm]}>{m.content}</Markdown>
                      : m.content}
                  </div>
                </div>
              ))}
              {loading && <StatusIndicator type="loading">Analyzing your data...</StatusIndicator>}
              <div ref={bottomRef} />
            </SpaceBetween>
          </div>
        </Container>

        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <Textarea value={input} onChange={({ detail }) => setInput(detail.value)}
              onKeyDown={handleKeyDown as any}
              placeholder="Provide corrections or ask questions... (Enter to send)" rows={2} disabled={loading} />
          </div>
          <Button onClick={handleSend} disabled={loading || !input.trim()} iconName="send">Send</Button>
        </div>
      </SpaceBetween>
    </Box>
  );
}
