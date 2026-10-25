function escapePdfText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\r\n]+/g, " ");
}

export function shoppingListPdf(title: string, familyName: string, lines: string[], emptyMessage = "Nenhum item na lista.") {
  const pages: { text: string; checkbox: boolean }[][] = [];
  let rows: { text: string; checkbox: boolean }[] = [];
  for (const name of lines) {
    // Keep even long product names within the printable area.
    const parts = name.replace(/[\r\n]+/g, " ").match(/.{1,52}(?:\s|$)|.{1,52}/g) ?? [""];
    if (rows.length + parts.length > 24) {
      pages.push(rows);
      rows = [];
    }
    rows.push(...parts.map((text, index) => ({ text: text.trim(), checkbox: index === 0 })));
  }
  if (rows.length) pages.push(rows);
  if (!pages.length) pages.push([]);

  const objects: string[] = [];
  const add = (value: string) => {
    objects.push(value);
    return objects.length;
  };
  const catalog = add("");
  const pagesObject = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const pageRefs: number[] = [];

  for (const pageLines of pages) {
    const commands = [
      "BT",
      "/F1 20 Tf",
      "50 790 Td",
      `(${escapePdfText(title)}) Tj`,
      "/F1 10 Tf",
      "0 -22 Td",
      `(${escapePdfText(familyName)}) Tj`,
      "0 -16 Td",
      `(${escapePdfText(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`)}) Tj`,
      "ET",
    ];
    let y = 710;
    if (!pageLines.length) {
      commands.push("BT", "/F1 14 Tf", `50 ${y} Td`, `(${escapePdfText(emptyMessage)}) Tj`, "ET");
    }
    for (const line of pageLines) {
      // Draw the checkbox: Unicode square glyphs are not supported by Latin-1.
      if (line.checkbox) commands.push(`0.9 w 50 ${y - 1} 12 12 re S`);
      commands.push("BT", "/F1 14 Tf", `74 ${y} Td`, `(${escapePdfText(line.text)}) Tj`, "ET");
      y -= 27;
    }
    const stream = commands.join("\n");
    const content = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    const page = add(
      `<< /Type /Page /Parent ${pagesObject} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`,
    );
    pageRefs.push(page);
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObject} 0 R >>`;
  objects[pagesObject - 1] =
    `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`;

  let pdf = "%PDF-1.4\n%\xFF\xFF\xFF\xFF\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const startXref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index++)
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${startXref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}
