import { z } from "zod";
import { HttpError } from "./domain.js";

export function validateFile(base64: string, mime: string, name: string, maximum = 10 * 1024 * 1024) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new HttpError(400, "Arquivo inválido");
  const bytes = Buffer.from(base64, "base64");
  const extension = name.toLowerCase().split(".").pop();
  const matches =
    mime === "image/png"
      ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && extension === "png"
      : mime === "image/jpeg"
        ? bytes[0] === 255 &&
          bytes[1] === 216 &&
          bytes[2] === 255 &&
          ["jpg", "jpeg"].includes(extension ?? "")
        : mime === "image/webp"
          ? bytes.toString("ascii", 0, 4) === "RIFF" &&
            bytes.toString("ascii", 8, 12) === "WEBP" &&
            extension === "webp"
          : mime === "application/pdf"
            ? bytes.toString("ascii", 0, 5) === "%PDF-" && extension === "pdf"
            : false;
  if (!matches || bytes.length === 0 || bytes.length > maximum)
    throw new HttpError(400, "Tipo, assinatura ou tamanho do arquivo inválido");
  return bytes;
}
export const imageSchema = z
  .string()
  .max(2_800_000)
  .nullable()
  .refine((value) => {
    if (value === null) return true;
    const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(value);
    if (!match) return false;
    try {
      validateFile(
        match[2],
        match[1],
        "photo." + (match[1] === "image/jpeg" ? "jpg" : match[1].split("/")[1]),
        2_000_000,
      );
      return true;
    } catch {
      return false;
    }
  }, "Use uma imagem PNG, JPG ou WebP válida de até 2 MB");
