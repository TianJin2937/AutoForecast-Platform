import { useState, useCallback, useRef } from "react";
import type { ChatMessage } from "../lib/types";

export function useSSEChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const streamResponse = useCallback(async (fetchFn: () => Promise<Response>) => {
    setStreaming(true);
    const now = new Date().toISOString();
    setMessages((prev) => [...prev, { role: "assistant", content: "", timestamp: now }]);

    try {
      const res = await fetchFn();
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              updated[updated.length - 1] = { ...last, content: last.content + data };
              return updated;
            });
          }
        }
      }
    } finally {
      setStreaming(false);
    }
  }, []);

  const addUserMessage = useCallback((content: string) => {
    setMessages((prev) => [...prev, { role: "user", content, timestamp: new Date().toISOString() }]);
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, []);

  return { messages, streaming, streamResponse, addUserMessage, abort };
}
