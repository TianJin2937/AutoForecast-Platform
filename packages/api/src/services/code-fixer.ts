import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

const bedrock = new BedrockRuntimeClient({});
const MODEL_ID = process.env.CODEGEN_MODEL ?? "us.anthropic.claude-opus-4-6-v1";

export async function fixCode(
  code: string,
  error: string,
  csvHeader: string
): Promise<string> {
  const response = await bedrock.send(
    new ConverseCommand({
      modelId: MODEL_ID,
      system: [
        {
          text: `You are fixing a Python forecasting script that failed on SageMaker.
Fix the error and return ONLY the corrected Python code. No explanation.
Use the AutoGluon 1.4 API: TimeSeriesDataFrame.from_data_frame(df, id_column=..., timestamp_column=...) and TimeSeriesPredictor(target=...).`,
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              text: [
                "## Failed Code\n```python\n" + code + "\n```",
                "\n## Error\n```\n" + error + "\n```",
                csvHeader ? "\n## CSV Header\n```\n" + csvHeader + "\n```" : "",
                "\nFix the code. Output ONLY Python code.",
              ].join("\n"),
            },
          ],
        },
      ],
      inferenceConfig: { maxTokens: 4096, temperature: 0.1 },
    })
  );

  const text = response.output?.message?.content?.[0]?.text ?? "";
  return text.replace(/^\s*```python\s*\n?/, "").replace(/\n?\s*```\s*$/, "").trim();
}
