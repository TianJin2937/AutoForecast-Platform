import { Hono } from "hono";
import { getSession } from "../services/dynamo.js";
import { getPresignedDownloadUrl } from "../services/s3.js";

export const resultsRoutes = new Hono();

resultsRoutes.get("/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const session = await getSession(sessionId);
  if (!session || session.status !== "COMPLETED") {
    return c.json({ error: "Results not ready" }, 400);
  }

  const prefix = `results/${sessionId}`;
  const urls = {
    backtestMetrics: await getPresignedDownloadUrl(`${prefix}/backtest_metrics.json`, "application/json"),
    forecastCsv: await getPresignedDownloadUrl(`${prefix}/forecast.csv`),
    forecastPlot: await getPresignedDownloadUrl(`${prefix}/forecast_plot.html`, "text/html"),
    backtestPlot: await getPresignedDownloadUrl(`${prefix}/backtest_plot.html`, "text/html"),
    generatedCode: await getPresignedDownloadUrl(`${prefix}/forecast_code.py`),
  };

  return c.json({ session, urls });
});
