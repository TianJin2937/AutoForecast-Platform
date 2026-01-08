import { Hono } from "hono";
import { v4 as uuid } from "uuid";
import { getSession, putSession, listSessions } from "../services/dynamo.js";
import type { Session } from "../models/types.js";

export const sessionRoutes = new Hono();

sessionRoutes.post("/", async (c) => {
  const userId = c.get("userId") ?? c.req.header("x-forwarded-user") ?? "anonymous";
  const session: Session = {
    id: uuid(),
    userId,
    status: "CREATED",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await putSession(session);
  return c.json(session, 201);
});

sessionRoutes.get("/:id", async (c) => {
  const session = await getSession(c.req.param("id"));
  if (!session) return c.json({ error: "Not found" }, 404);
  return c.json(session);
});

sessionRoutes.get("/", async (c) => {
  const userId = c.req.query("userId") || c.get("userId") || c.req.header("x-forwarded-user") || "";
  const sessions = await listSessions(userId);
  return c.json(sessions);
});
