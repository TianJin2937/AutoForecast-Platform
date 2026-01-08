import { Hono } from "hono";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSession, putSession } from "../services/dynamo.js";
import { generateForecastCode } from "../services/code-generator.js";
import { launchForecastJob, launchValidationJob, getJobStatus } from "../services/runner.js";
import { fixCode } from "../services/code-fixer.js";
import { getSageMakerJobError } from "../services/log-fetcher.js";

const lambdaClient = new LambdaClient({});
const s3 = new S3Client({});
const BUCKET = process.env.DATA_BUCKET ?? "autoforecast-data";
const MAX_FIX_ATTEMPTS = 3;

export const forecastRoutes = new Hono();

forecastRoutes.post("/:sessionId/run", async (c) => {
  const sessionId = c.req.param("sessionId");
  const session = await getSession(sessionId);
  if (!session || session.status !== "APPROVED") {
    return c.json({ error: "Session not approved" }, 400);
  }

  session.status = "RUNNING";
  session.runStep = 0;
  session.runStartedAt = new Date().toISOString();
  session.updatedAt = session.runStartedAt;
  await putSession(session);

  await lambdaClient.send(new InvokeCommand({
    FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME!,
    InvocationType: "Event",
    Payload: Buffer.from(JSON.stringify({ __forecastPipeline: true, sessionId })),
  }));

  return c.json({ status: "RUNNING", message: "Forecast pipeline started" });
});

forecastRoutes.get("/:sessionId/status", async (c) => {
  const sessionId = c.req.param("sessionId");
  const session = await getSession(sessionId);
  if (!session) return c.json({ error: "Not found" }, 404);
  return c.json({ status: session.status, jobId: session.forecastJobId });
});

// --- Async pipeline with iterative validation ---

export async function runForecastPipeline(sessionId: string) {
  const session = await getSession(sessionId);
  if (!session) throw new Error("Session not found");

  try {
    // Fetch CSV header for code gen context
    let csvHeader = "";
    try {
      const { Body } = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: session.dataKey! }));
      csvHeader = (await Body!.transformToString()).split("\n").slice(0, 5).join("\n");
    } catch { /* ignore */ }

    // Step 1: Generate initial code
    console.log(`[${sessionId}] Generating code with Opus 4.6...`);
    let code = await generateForecastCode(session);
    console.log(`[${sessionId}] Code generated (${code.length} chars)`);

    // Step 2: Validate + fix loop
    const s0 = await getSession(sessionId);
    if (s0) { s0.runStep = 1; s0.updatedAt = new Date().toISOString(); await putSession(s0); }
    for (let attempt = 0; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
      console.log(`[${sessionId}] Validation attempt ${attempt + 1}/${MAX_FIX_ATTEMPTS + 1}`);

      const valJobName = await launchValidationJob(sessionId, code, session.dataKey!);
      const valStatus = await pollJob(valJobName, 60); // 60 * 10s = 10 min (provisioning + run + status propagation)

      if (valStatus === "Completed") {
        console.log(`[${sessionId}] ✅ Validation passed on attempt ${attempt + 1}`);
        break;
      }

      if (attempt === MAX_FIX_ATTEMPTS) {
        console.error(`[${sessionId}] ❌ Failed after ${MAX_FIX_ATTEMPTS} fix attempts`);
        const s = await getSession(sessionId);
        if (s) { s.status = "FAILED"; s.updatedAt = new Date().toISOString(); await putSession(s); }
        return;
      }

      // Get error and fix
      const error = await getSageMakerJobError(valJobName);
      console.log(`[${sessionId}] Validation failed: ${error.slice(0, 200)}`);
      console.log(`[${sessionId}] Asking Opus 4.6 to fix...`);
      code = await fixCode(code, error, csvHeader);
      console.log(`[${sessionId}] Code fixed (${code.length} chars)`);
    }

    // Step 3: Launch full forecast job with validated code
    console.log(`[${sessionId}] Launching full SageMaker job...`);
    const jobId = await launchForecastJob(sessionId, code, session.dataKey!);
    const s1 = await getSession(sessionId);
    if (s1) { s1.forecastJobId = jobId; s1.runStep = 2; s1.updatedAt = new Date().toISOString(); await putSession(s1); }

    // Step 4: Poll until complete
    const finalStatus = await pollJob(jobId, 84); // 84 * 10s = 14 min
    const s2 = await getSession(sessionId);
    if (s2) {
      s2.runStep = 3;
      s2.status = finalStatus === "Completed" ? "COMPLETED" : "FAILED";
      s2.updatedAt = new Date().toISOString();
      await putSession(s2);
    }
    console.log(`[${sessionId}] Pipeline ${finalStatus}`);
  } catch (err: any) {
    const s = await getSession(sessionId);
    if (s) { s.status = "FAILED"; s.updatedAt = new Date().toISOString(); await putSession(s); }
    console.error(`[${sessionId}] Pipeline error:`, err);
    throw err;
  }
}

async function pollJob(jobName: string, maxAttempts: number): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await getJobStatus(jobName);
    if (status === "Completed" || status === "Failed" || status === "Stopped") return status!;
    await new Promise((r) => setTimeout(r, 10000));
  }
  return "Failed";
}
