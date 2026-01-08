import { Hono } from "hono";
import { cors } from "hono/cors";
import { sessionRoutes } from "./routes/session.js";
import { uploadRoutes } from "./routes/upload.js";
import { profilerRoutes } from "./routes/profiler.js";
import { forecastRoutes } from "./routes/forecast.js";
import { resultsRoutes } from "./routes/results.js";

export const app = new Hono();

app.use("/*", cors({ origin: "https://d1hrsx6j3a7a3k.cloudfront.net" }));

// Extract Midway authenticated user from x-forwarded-user header
app.use("/*", async (c, next) => {
  const user = c.req.header("x-forwarded-user") ?? "anonymous";
  c.set("userId", user);
  await next();
});

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/api/sessions", sessionRoutes);
app.route("/api/upload", uploadRoutes);
app.route("/api/profiler", profilerRoutes);
app.route("/api/forecast", forecastRoutes);
app.route("/api/results", resultsRoutes);
