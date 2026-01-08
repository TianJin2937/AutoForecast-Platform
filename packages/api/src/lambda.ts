import { handle } from "hono/aws-lambda";
import { app } from "./app.js";
import { runForecastPipeline } from "./routes/forecast.js";
import { scanRunningSessions, getSession, putSession } from "./services/dynamo.js";
import { getJobStatus } from "./services/runner.js";

const honoHandler = handle(app);

async function recoverStuckSessions() {
  const stale = await scanRunningSessions(20); // sessions stuck >20 min
  console.log(`[Recovery] Found ${stale.length} stale RUNNING sessions`);

  for (const session of stale) {
    if (!session.forecastJobId) {
      // Lambda died before launching job — mark as failed
      session.status = "FAILED";
      session.updatedAt = new Date().toISOString();
      await putSession(session);
      console.log(`[Recovery] ${session.id}: no job ID, marked FAILED`);
      continue;
    }

    const status = await getJobStatus(session.forecastJobId);
    if (status === "Completed") {
      session.status = "COMPLETED";
      session.runStep = 3;
      session.updatedAt = new Date().toISOString();
      await putSession(session);
      console.log(`[Recovery] ${session.id}: job completed, marked COMPLETED`);
    } else if (status === "Failed" || status === "Stopped") {
      session.status = "FAILED";
      session.updatedAt = new Date().toISOString();
      await putSession(session);
      console.log(`[Recovery] ${session.id}: job ${status}, marked FAILED`);
    } else {
      console.log(`[Recovery] ${session.id}: job still ${status}, skipping`);
    }
  }

  return { recovered: stale.length };
}

export const handler = async (event: any, context: any) => {
  // Scheduled recovery (EventBridge)
  if (event.source === "aws.events" || event.__recovery) {
    return recoverStuckSessions();
  }

  // Async forecast pipeline invocation (InvocationType: Event)
  if (event.__forecastPipeline && event.sessionId) {
    console.log("Running async forecast pipeline for session:", event.sessionId);
    await runForecastPipeline(event.sessionId);
    return { statusCode: 200, body: "OK" };
  }

  // Normal HTTP request via API Gateway
  return honoHandler(event, context);
};
