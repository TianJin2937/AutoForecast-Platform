import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { Session } from "../models/types.js";

const bedrock = new BedrockRuntimeClient({});
const MODEL_ID = process.env.CODEGEN_MODEL ?? "us.anthropic.claude-opus-4-6-v1";

const CODE_SYSTEM_PROMPT = `You are a Python code generator for time series forecasting using AutoGluon 1.4.
Generate a complete, self-contained Python script. The forecast plan below specifies which models to use, the target column, prediction horizon, frequency, and other parameters. Follow the plan.

## AutoGluon 1.4 API Reference

\`\`\`python
from autogluon.timeseries import TimeSeriesDataFrame, TimeSeriesPredictor
import glob, pandas as pd

csv_files = glob.glob("/opt/ml/processing/input/*.csv")
df = pd.read_csv(csv_files[0])

tsdf = TimeSeriesDataFrame.from_data_frame(
    df,
    id_column="item_id_column",
    timestamp_column="timestamp_column",
)

predictor = TimeSeriesPredictor(
    target="target_column",
    prediction_length=30,       # from plan
    eval_metric="WAPE",
    path="/tmp/ag_model",
)
predictor.fit(tsdf, hyperparameters={
    # Choose from plan. Available models:
    # Statistical: "ETS", "AutoARIMA", "Theta", "Naive", "SeasonalNaive", "NPTS", "AutoETS", "DynamicOptimizedTheta"
    # Zero-shot: "Chronos": {"model_path": "amazon/chronos-bolt-base"}  (or chronos-bolt-small, chronos-bolt-mini)
    # NOTE: Do NOT use deep learning models (DeepAR, TemporalFusionTransformer, etc.) — they require GPU
})
leaderboard = predictor.leaderboard(tsdf)
predictions = predictor.predict(tsdf)
\`\`\`

## Rules
1. Read the forecast plan carefully. Use the models, horizon, frequency, and target it specifies.
2. Find CSV via glob in /opt/ml/processing/input/
3. Save to /opt/ml/processing/output/: forecast.csv, backtest_metrics.json, forecast_plot.html, backtest_plot.html, forecast_code.py
4. Use plotly for interactive charts
5. Do NOT use deep learning or GPU models (no DeepAR, TFT, PatchTST, etc.)
6. If the plan recommends models not in AutoGluon, map them to the closest available model
7. Use the EXACT column names from the CSV header
Output ONLY Python code, no explanation.`;

export async function generateForecastCode(session: Session): Promise<string> {
  // Fetch CSV header to give LLM actual column names
  const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({});
  const BUCKET = process.env.DATA_BUCKET ?? "autoforecast-data";
  let csvHeader = "";
  try {
    const { Body } = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: session.dataKey! }));
    const text = await Body!.transformToString();
    const lines = text.split("\n").slice(0, 5);
    csvHeader = lines.join("\n");
  } catch { /* ignore */ }

  const response = await bedrock.send(
    new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: CODE_SYSTEM_PROMPT }],
      messages: [
        {
          role: "user",
          content: [
            {
              text: [
                `## Approved Forecast Plan\n${session.hypothesis ?? "No plan available — use ETS, AutoARIMA, Theta, Chronos with sensible defaults."}`,
                csvHeader ? `\n## Actual CSV Header + Sample\n\`\`\`\n${csvHeader}\n\`\`\`` : "",
                session.context ? `\n## User Context\n${session.context}` : "",
                "\nGenerate the forecasting script following the plan above. Use the EXACT column names from the CSV header.",
              ].join("\n"),
            },
          ],
        },
      ],
      inferenceConfig: { maxTokens: 4096, temperature: 0.1 },
    })
  );

  const text =
    response.output?.message?.content?.[0]?.text ?? "";
  // Strip markdown code fences if present (handles leading/trailing whitespace)
  return text.replace(/^\s*```python\s*\n?/, "").replace(/\n?\s*```\s*$/, "").trim();
}
