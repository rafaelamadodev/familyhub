import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { spawn } from "node:child_process";
import { finished } from "node:stream/promises";
import dotenv from "dotenv";
import { ListObjectsV2Command, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const root = process.cwd();
dotenv.config({ path: join(root, "apps/api/.env") });
const stamp = new Date().toISOString().replaceAll(":", "-");
const directory = resolve(root, "backups", stamp);
if (!directory.startsWith(resolve(root, "backups") + sep)) throw new Error("Invalid backup destination");
await mkdir(join(directory, "minio"), { recursive: true });
const dump = spawn(
  "docker",
  ["compose", "exec", "-T", "postgres", "pg_dump", "-U", "familyhub", "-d", "familyhub", "-Fc"],
  { cwd: root, stdio: ["ignore", "pipe", "inherit"] },
);
const dumpFile = createWriteStream(join(directory, "database.dump"));
dump.stdout.pipe(dumpFile);
const dumpFileFinished = finished(dumpFile);
const exitCode = await new Promise((resolveExit, reject) => {
  dump.once("error", reject);
  dump.once("close", (code) =>
    code === 0 ? resolveExit(code) : reject(new Error(`pg_dump exited with ${code}`)),
  );
});
await dumpFileFinished;
if (exitCode !== 0) throw new Error("Database backup failed");

const endpoint = process.env.MINIO_ENDPOINT ?? "http://localhost:9000";
const client = new S3Client({
  endpoint,
  region: "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? "",
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? "",
  },
});
const bucket = process.env.MINIO_BUCKET ?? "familyhub-private";
let continuationToken;
const objectKeys = [];
do {
  const page = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken }),
  );
  for (const object of page.Contents ?? [])
    if (object.Key && /^[a-f0-9-]{36}$/i.test(object.Key)) objectKeys.push(object.Key);
  continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (continuationToken);
for (const key of objectKeys) {
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) throw new Error(`Missing MinIO object ${key}`);
  const bytes = await response.Body.transformToByteArray();
  await writeFile(join(directory, "minio", key), bytes, { flag: "wx" });
}
await writeFile(
  join(directory, "manifest.json"),
  JSON.stringify({ createdAt: new Date().toISOString(), objectKeys }, null, 2),
  { flag: "wx" },
);
process.stdout.write(`Backup complete: ${directory}\n`);
