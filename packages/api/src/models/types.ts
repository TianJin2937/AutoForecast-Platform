export type SessionStatus =
  | "CREATED"
  | "UPLOADING"
  | "PROFILING"
  | "REVIEWING"
  | "APPROVED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED";

export interface Session {
  id: string;
  userId: string;
  status: SessionStatus;
  dataKey?: string;
  context?: string;
  hypothesis?: string;
  forecastPlan?: string;
  forecastJobId?: string;
  resultsKey?: string;
  runStep?: number; // 0=code gen, 1=validation, 2=full job, 3=producing results
  runStartedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ForecastConfig {
  timeColumn: string;
  targetColumn: string;
  itemColumn?: string;
  timeGranularity: "hourly" | "daily" | "weekly" | "monthly";
  forecastHorizon: number;
  models: string[];
}
