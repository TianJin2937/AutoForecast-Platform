import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Session } from "../models/types.js";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.SESSIONS_TABLE ?? "AutoForecastSessions";

export async function getSession(id: string): Promise<Session | undefined> {
  const { Item } = await client.send(
    new GetCommand({ TableName: TABLE, Key: { id } })
  );
  return Item as Session | undefined;
}

export async function putSession(session: Session): Promise<void> {
  await client.send(new PutCommand({ TableName: TABLE, Item: session }));
}

export async function listSessions(userId: string): Promise<Session[]> {
  const { Items } = await client.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "userId-index",
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": userId },
    })
  );
  return (Items ?? []) as Session[];
}

export async function scanRunningSessions(staleMinutes: number): Promise<Session[]> {
  const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000).toISOString();
  const { Items } = await client.send(
    new ScanCommand({
      TableName: TABLE,
      FilterExpression: "#s = :running AND updatedAt < :cutoff",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":running": "RUNNING", ":cutoff": cutoff },
    })
  );
  return (Items ?? []) as Session[];
}
