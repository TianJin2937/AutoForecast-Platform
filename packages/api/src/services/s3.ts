import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({});
const BUCKET = process.env.DATA_BUCKET ?? "autoforecast-data";

export async function getPresignedUploadUrl(
  key: string,
  contentType: string
): Promise<string> {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 3600 }
  );
}

export async function getPresignedDownloadUrl(key: string, contentType?: string): Promise<string> {
  const params: any = { Bucket: BUCKET, Key: key };
  if (contentType) {
    params.ResponseContentType = contentType;
    params.ResponseContentDisposition = "inline";
  }
  return getSignedUrl(s3, new GetObjectCommand(params), { expiresIn: 3600 });
}
