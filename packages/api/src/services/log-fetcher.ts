import {
  CloudWatchLogsClient,
  GetLogEventsCommand,
  DescribeLogStreamsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  SageMakerClient,
  DescribeProcessingJobCommand,
} from "@aws-sdk/client-sagemaker";

const logs = new CloudWatchLogsClient({});
const sagemaker = new SageMakerClient({});
const LOG_GROUP = "/aws/sagemaker/ProcessingJobs";

export async function getSageMakerJobError(jobName: string): Promise<string> {
  const parts: string[] = [];

  // 1. Get FailureReason from SageMaker
  try {
    const { FailureReason } = await sagemaker.send(
      new DescribeProcessingJobCommand({ ProcessingJobName: jobName })
    );
    if (FailureReason) parts.push(`FailureReason: ${FailureReason}`);
  } catch { /* ignore */ }

  // 2. Get the last 50 log lines (tail) from CloudWatch
  try {
    // Find the log stream (jobName/algo-1-TIMESTAMP)
    const { logStreams } = await logs.send(
      new DescribeLogStreamsCommand({
        logGroupName: LOG_GROUP,
        logStreamNamePrefix: jobName,
        descending: true,
        limit: 1,
      })
    );
    const streamName = logStreams?.[0]?.logStreamName;
    if (streamName) {
      const { events } = await logs.send(
        new GetLogEventsCommand({
          logGroupName: LOG_GROUP,
          logStreamName: streamName,
          startFromHead: false,
          limit: 50,
        })
      );
      if (events?.length) {
        parts.push(events.map((e) => e.message).join("\n"));
      }
    }
  } catch { /* ignore */ }

  return parts.join("\n\n").slice(-4000) || "Job failed with no error logs";
}
