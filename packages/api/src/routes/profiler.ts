import { Hono } from "hono";
import { analyzeData, refineHypothesis } from "../services/profiler.js";
import { getSession, putSession } from "../services/dynamo.js";

export const profilerRoutes = new Hono();

profilerRoutes.post("/:sessionId/analyze", async (c) => {
  const sessionId = c.req.param("sessionId");
  const { context } = await c.req.json<{ context?: string }>();
  const session = await getSession(sessionId);
  if (!session?.dataKey) return c.json({ error: "No data uploaded" }, 400);

  session.status = "PROFILING";
  session.context = context;
  session.updatedAt = new Date().toISOString();
  await putSession(session);

  const result = await analyzeData(session.dataKey!, context);
  const chunks: string[] = [];
  for await (const chunk of result) chunks.push(chunk);
  const fullText = chunks.join("");

  session.status = "REVIEWING";
  session.hypothesis = fullText;
  session.forecastPlan = fullText;
  session.updatedAt = new Date().toISOString();
  await putSession(session);

  return c.json({ hypothesis: fullText, plan: fullText });
});

profilerRoutes.post("/:sessionId/refine", async (c) => {
  const sessionId = c.req.param("sessionId");
  const { feedback, additionalContext } = await c.req.json<{
    feedback: string;
    additionalContext?: string;
  }>();
  const session = await getSession(sessionId);
  if (!session) return c.json({ error: "Not found" }, 404);

  const result = await refineHypothesis(session, feedback, additionalContext);
  const chunks: string[] = [];
  for await (const chunk of result) chunks.push(chunk);
  const fullText = chunks.join("");

  session.hypothesis = fullText;
  session.forecastPlan = fullText;
  session.updatedAt = new Date().toISOString();
  await putSession(session);

  return c.json({ hypothesis: fullText, plan: fullText });
});

profilerRoutes.post("/:sessionId/approve", async (c) => {
  const sessionId = c.req.param("sessionId");
  const session = await getSession(sessionId);
  if (!session) return c.json({ error: "Not found" }, 404);
  session.status = "APPROVED";
  session.updatedAt = new Date().toISOString();
  await putSession(session);
  return c.json(session);
});
