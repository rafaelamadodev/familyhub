import { randomUUID } from "node:crypto";
import {
  S3Client,
  CreateBucketCommand,
  DeleteObjectCommand,
  GetBucketPolicyCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { HttpError } from "../../shared/domain.js";
import { validateFile } from "../../shared/files.js";
const client = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT ?? "http://localhost:9000",
  region: "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? "",
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? "",
  },
});
const Bucket = process.env.MINIO_BUCKET ?? "familyhub-private";
export async function storeFile(base64: string, mime: string, name: string) {
  const bytes = validateFile(base64, mime, name);
  if (mime === "image/webp") throw new HttpError(400, "Documentos aceitam PDF, JPG e PNG");
  if (process.env.FILE_SCANNER_URL) {
    try {
      const result = await fetch(process.env.FILE_SCANNER_URL, {
        method: "POST",
        body: new Uint8Array(bytes),
        headers: { "Content-Type": mime },
        signal: AbortSignal.timeout(15000),
      });
      if (!result.ok) throw new Error("Scanner unavailable");
      if (((await result.json()) as { clean?: boolean }).clean !== true)
        throw new HttpError(422, "Arquivo bloqueado pela verificação de segurança");
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(503, "Verificação de segurança indisponível. Tente novamente.");
    }
  }
  // No public ACL is created. Buckets are private by default.
  try {
    await client.send(new HeadBucketCommand({ Bucket }));
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404)
      throw new HttpError(503, "Armazenamento de arquivos indisponível");
    await client.send(new CreateBucketCommand({ Bucket }));
  }
  try {
    const policy = await client.send(new GetBucketPolicyCommand({ Bucket }));
    const statements = JSON.parse(policy.Policy ?? "{}").Statement ?? [];
    if (
      statements.some(
        (statement: { Effect?: string; Principal?: unknown }) =>
          statement.Effect === "Allow" && JSON.stringify(statement.Principal).includes('"*"'),
      )
    )
      throw new HttpError(503, "O bucket deve ser privado antes de receber documentos");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (!["NoSuchBucketPolicy", "NoSuchPolicy"].includes((error as { name: string }).name))
      throw new HttpError(503, "Não foi possível validar a privacidade do armazenamento");
  }
  const key = randomUUID();
  try {
    await client.send(new PutObjectCommand({ Bucket, Key: key, Body: bytes, ContentType: mime }));
  } catch {
    throw new HttpError(503, "Não foi possível armazenar o arquivo");
  }
  return { objectKey: key, mimeType: mime, sizeBytes: bytes.length };
}
export async function fileUrl(key: string) {
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket,
      Key: key,
      ResponseContentDisposition: 'attachment; filename="documento"',
    }),
    { expiresIn: 60 },
  );
}
export async function deleteFile(key: string) {
  await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
}
