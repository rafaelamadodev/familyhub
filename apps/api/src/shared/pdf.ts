function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[\r\n]+/g, " ");
}

export function shoppingListPdf(title: string, familyName: string, lines: string[]) {
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += 42) pages.push(lines.slice(index, index + 42));
  if (!pages.length) pages.push([]);

  const objects: string[] = [];
  const add = (value: string) => {
    objects.push(value);
    return objects.length;
  };
  const catalog = add("");
  const pagesObject = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageRefs: number[] = [];

  for (const pageLines of pages) {
    const commands = ["BT", "/F1 20 Tf", "50 790 Td", `(${escapePdfText(title)}) Tj`, "/F1 10 Tf", "0 -22 Td", `(${escapePdfText(familyName)}) Tj`, "0 -16 Td", `(${escapePdfText(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`)}) Tj`, "/F1 11 Tf", "0 -28 Td"];
    for (const line of pageLines) {
      commands.push(`(${escapePdfText(line)}) Tj`, "0 -17 Td");
    }
    commands.push("ET");
    const stream = commands.join("\n");
    const content = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    const page = add(`<< /Type /Page /Parent ${pagesObject} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`);
    pageRefs.push(page);
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObject} 0 R >>`;
  objects[pagesObject - 1] = `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`;

  let pdf = "%PDF-1.4\n%\xFF\xFF\xFF\xFF\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const startXref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index++) pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${startXref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}
