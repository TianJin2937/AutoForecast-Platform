import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import type { Session } from "../models/types.js";

const bedrock = new BedrockRuntimeClient({});
const s3 = new S3Client({});
const BUCKET = process.env.DATA_BUCKET ?? "autoforecast-data";
const MODEL_ID = process.env.PROFILER_MODEL ?? "us.anthropic.claude-opus-4-6-v1";

async function fetchDataSample(dataKey: string): Promise<string> {
  const { Body } = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: dataKey })
  );
  const text = await Body!.transformToString();
  // Return first 200 lines as sample for profiling
  return text.split("\n").slice(0, 200).join("\n");
}

const SYSTEM_PROMPT = `You are a time series data analyst. Given a CSV data sample and optional context:
1. Identify columns: timestamp, target variable(s), item/entity identifiers, features
2. Detect time granularity (hourly, daily, weekly, monthly)
3. Detect entity granularity (node, region, SKU, etc.)
4. Identify data quality issues (missing values, outliers, gaps)
5. Propose a hypothesis about the data and a forecasting plan
6. Recommend forecast horizon and model types (statistical + Chronos/Chronos2 only, no finetuning)

Output a structured hypothesis and plan. Be specific and actionable.`;

export async function analyzeData(dataKey: string, context?: string) {
  const sample = await fetchDataSample(dataKey);
  const userMessage = [
    "## Data Sample (first 200 rows)\n```csv\n" + sample + "\n```",
    context ? `\n## User Context\n${context}` : "",
  ].join("\n");

  const stream = await bedrock.send(
    new ConverseStreamCommand({
      modelId: MODEL_ID,
      system: [{ text: SYSTEM_PROMPT }],
      messages: [{ role: "user", content: [{ text: userMessage }] }],
      inferenceConfig: { maxTokens: 4096, temperature: 0.3 },
    })
  );

  let hypothesis = "";
  let plan = "";
  const chunks: string[] = [];

  async function* iterate() {
    for await (const event of stream.stream!) {
      if (event.contentBlockDelta?.delta?.text) {
        const text = event.contentBlockDelta.delta.text;
        chunks.push(text);
        yield text;
      }
    }
    const full = chunks.join("");
    hypothesis = full;
    plan = full;
  }

  const iterator = iterate();
  (iterator as any).hypothesis = "";
  (iterator as any).plan = "";

  // After iteration completes, these get populated
  Object.defineProperty(iterator, "hypothesis", { get: () => hypothesis });
  Object.defineProperty(iterator, "plan", { get: () => plan });

  return iterator as AsyncGenerator<string> & { hypothesis: string; plan: string };
}

export async function refineHypothesis(
  session: Session,
  feedback: string,
  additionalContext?: string
) {
  const messages = [
    {
      role: "user" as const,
      content: [{ text: `Previous hypothesis:\n${session.hypothesis}\n\nPrevious plan:\n${session.forecastPlan}` }],
    },
    {
      role: "assistant" as const,
      content: [{ text: session.hypothesis ?? "No previous hypothesis." }],
    },
    {
      role: "user" as const,
      content: [
        {
          text: [
            `## User Feedback\n${feedback}`,
            additionalContext ? `\n## Additional Context\n${additionalContext}` : "",
            "\nPlease revise the hypothesis and forecasting plan based on this feedback.",
          ].join("\n"),
        },
      ],
    },
  ];

  const stream = await bedrock.send(
    new ConverseStreamCommand({
      modelId: MODEL_ID,
      system: [{ text: SYSTEM_PROMPT }],
      messages,
      inferenceConfig: { maxTokens: 4096, temperature: 0.3 },
    })
  );

  let hypothesis = "";
  const chunks: string[] = [];

  async function* iterate() {
    for await (const event of stream.stream!) {
      if (event.contentBlockDelta?.delta?.text) {
        const text = event.contentBlockDelta.delta.text;
        chunks.push(text);
        yield text;
      }
    }
    hypothesis = chunks.join("");
  }

  const iterator = iterate();
  Object.defineProperty(iterator, "hypothesis", { get: () => hypothesis });
  Object.defineProperty(iterator, "plan", { get: () => hypothesis });

  return iterator as AsyncGenerator<string> & { hypothesis: string; plan: string };
}
