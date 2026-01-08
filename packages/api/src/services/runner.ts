import {
  SageMakerClient,
  CreateProcessingJobCommand,
  DescribeProcessingJobCommand,
} from "@aws-sdk/client-sagemaker";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const sagemaker = new SageMakerClient({});
const s3 = new S3Client({});
const BUCKET = process.env.DATA_BUCKET ?? "autoforecast-data";
const ROLE_ARN = process.env.SAGEMAKER_ROLE_ARN ?? "";
const AUTOGLUON_IMAGE =
  process.env.AUTOGLUON_IMAGE ??
  "763104351884.dkr.ecr.us-east-1.amazonaws.com/autogluon-inference:1.4.0-cpu-py311-ubuntu22.04-v1.0";

export async function launchForecastJob(
  sessionId: string,
  code: string,
  dataKey: string
): Promise<string> {
  const codeKey = `code/${sessionId}/forecast_code.py`;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: codeKey,
      Body: code,
      ContentType: "text/x-python",
    })
  );

  const jobName = `autoforecast-${sessionId.slice(0, 8)}-${Date.now()}`;

  await sagemaker.send(
    new CreateProcessingJobCommand({
      ProcessingJobName: jobName,
      RoleArn: ROLE_ARN,
      AppSpecification: {
        ImageUri: AUTOGLUON_IMAGE,
        ContainerEntrypoint: ["python3", "/opt/ml/processing/input/code/forecast_code.py"],
      },
      ProcessingResources: {
        ClusterConfig: {
          InstanceCount: 1,
          InstanceType: "ml.m5.xlarge",
          VolumeSizeInGB: 30,
        },
      },
      StoppingCondition: { MaxRuntimeInSeconds: 3600 },
      ProcessingInputs: [
        {
          InputName: "data",
          S3Input: {
            S3Uri: `s3://${BUCKET}/${dataKey}`,
            LocalPath: "/opt/ml/processing/input",
            S3DataType: "S3Prefix",
            S3InputMode: "File",
          },
        },
        {
          InputName: "code",
          S3Input: {
            S3Uri: `s3://${BUCKET}/${codeKey}`,
            LocalPath: "/opt/ml/processing/input/code",
            S3DataType: "S3Prefix",
            S3InputMode: "File",
          },
        },
      ],
      ProcessingOutputConfig: {
        Outputs: [
          {
            OutputName: "results",
            S3Output: {
              S3Uri: `s3://${BUCKET}/results/${sessionId}`,
              LocalPath: "/opt/ml/processing/output",
              S3UploadMode: "EndOfJob",
            },
          },
        ],
      },
    })
  );

  return jobName;
}

export async function getJobStatus(jobName: string) {
  const { ProcessingJobStatus } = await sagemaker.send(
    new DescribeProcessingJobCommand({ ProcessingJobName: jobName })
  );
  return ProcessingJobStatus;
}

export async function launchValidationJob(
  sessionId: string,
  code: string,
  dataKey: string
): Promise<string> {
  const codeKey = `code/${sessionId}/validate_code.py`;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: codeKey,
      Body: code,
      ContentType: "text/x-python",
    })
  );

  const jobName = `validate-${sessionId.slice(0, 8)}-${Date.now()}`;

  await sagemaker.send(
    new CreateProcessingJobCommand({
      ProcessingJobName: jobName,
      RoleArn: ROLE_ARN,
      AppSpecification: {
        ImageUri: AUTOGLUON_IMAGE,
        ContainerEntrypoint: ["python3", "/opt/ml/processing/input/code/validate_code.py"],
      },
      ProcessingResources: {
        ClusterConfig: {
          InstanceCount: 1,
          InstanceType: "ml.t3.medium",
          VolumeSizeInGB: 10,
        },
      },
      StoppingCondition: { MaxRuntimeInSeconds: 180 },
      ProcessingInputs: [
        {
          InputName: "data",
          S3Input: {
            S3Uri: `s3://${BUCKET}/${dataKey}`,
            LocalPath: "/opt/ml/processing/input",
            S3DataType: "S3Prefix",
            S3InputMode: "File",
          },
        },
        {
          InputName: "code",
          S3Input: {
            S3Uri: `s3://${BUCKET}/${codeKey}`,
            LocalPath: "/opt/ml/processing/input/code",
            S3DataType: "S3Prefix",
            S3InputMode: "File",
          },
        },
      ],
      ProcessingOutputConfig: {
        Outputs: [
          {
            OutputName: "results",
            S3Output: {
              S3Uri: `s3://${BUCKET}/validation/${sessionId}`,
              LocalPath: "/opt/ml/processing/output",
              S3UploadMode: "EndOfJob",
            },
          },
        ],
      },
    })
  );

  return jobName;
}

export async function getJobFailureReason(jobName: string): Promise<string> {
  const { FailureReason } = await sagemaker.send(
    new DescribeProcessingJobCommand({ ProcessingJobName: jobName })
  );
  return FailureReason ?? "Unknown error";
}
