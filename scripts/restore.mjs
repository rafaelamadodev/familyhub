import { readFile } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { spawn } from "node:child_process";
import dotenv from "dotenv";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const root = process.cwd();
dotenv.config({ path: join(root, "apps/api/.env") });
const [backupName, confirmation] = process.argv.slice(2);
if (!backupName || !/^[\dT.Z-]+$/.test(backupName) || confirmation !== "--confirm-replace-familyhub") {
  throw new Error(
    "Uso: node scripts/restore.mjs <nome-da-pasta-do-backup> --confirm-replace-familyhub. Este comando substitui os dados atuais do banco familyhub.",
  );
}
const backupRoot = resolve(root, "backups");
const directory = resolve(backupRoot, backupName);
if (!directory.startsWith(backupRoot + sep)) throw new Error("Backup path is outside backups directory");
const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
if (
  !Array.isArray(manifest.objectKeys) ||
  manifest.objectKeys.some((key) => typeof key !== "string" || !/^[a-f0-9-]{36}$/i.test(key))
)
  throw new Error("Invalid backup manifest");
const restore = spawn(
  "docker",
  [
    "compose",
    "exec",
    "-T",
    "postgres",
    "pg_restore",
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "-U",
    "familyhub",
    "-d",
    "familyhub",
  ],
  { cwd: root, stdio: ["pipe", "inherit", "inherit"] },
);
const failure = new Promise((_, reject) => restore.once("error", reject));
const data = await readFile(join(directory, "database.dump"));
restore.stdin.end(data);
const exit = await Promise.race([new Promise((resolveExit) => restore.once("close", resolveExit)), failure]);
if (exit !== 0) throw new Error(`pg_restore exited with ${exit}`);

const client = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT ?? "http://localhost:9000",
  region: "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? "",
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? "",
  },
});
const bucket = process.env.MINIO_BUCKET ?? "familyhub-private";
for (const key of manifest.objectKeys)
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: await readFile(join(directory, "minio", key)) }),
  );
process.stdout.write(`Restore complete into familyhub. Restored objects: ${manifest.objectKeys.length}\n`);
