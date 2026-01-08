import { Hono } from "hono";
import { getPresignedUploadUrl } from "../services/s3.js";
import { getSession, putSession } from "../services/dynamo.js";

export const uploadRoutes = new Hono();

uploadRoutes.post("/presign", async (c) => {
  const { sessionId, fileName, contentType } = await c.req.json<{
    sessionId: string;
    fileName: string;
    contentType: string;
  }>();
  const key = `uploads/${sessionId}/${fileName}`;
  const url = await getPresignedUploadUrl(key, contentType);
  const session = await getSession(sessionId);
  if (session) {
    session.dataKey = key;
    session.status = "UPLOADING";
    session.updatedAt = new Date().toISOString();
    await putSession(session);
  }
  return c.json({ url, key });
});
