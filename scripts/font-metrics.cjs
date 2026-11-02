const fs = require("fs");
function parseTtf(path) {
  const buf = fs.readFileSync(path);
  const numTables = buf.readUInt16BE(4);
  let head = null, hhea = null, os2 = null;
  for (let i = 0; i < numTables; i++) {
    const tag = buf.toString("ascii", 12 + i * 16, 12 + i * 16 + 4);
    const offset = buf.readUInt32BE(12 + i * 16 + 8);
    if (tag === "head") head = offset;
    if (tag === "hhea") hhea = offset;
    if (tag === "OS/2") os2 = offset;
  }
  const unitsPerEm = buf.readUInt16BE(head + 18);
  const ascender = buf.readInt16BE(hhea + 4);
  const descender = buf.readInt16BE(hhea + 6);
  const xHeight = os2 != null ? buf.readInt16BE(os2 + 88) : null; // sxHeight
  const capHeight = os2 != null ? buf.readInt16BE(os2 + 90) : null; // sCapHeight
  return { unitsPerEm, ascender, descender, xHeight, capHeight };
}
for (const p of process.argv.slice(2)) {
  try {
    const m = parseTtf(p);
    console.log(p);
    console.log(`  unitsPerEm=${m.unitsPerEm} ascent=${(m.ascender/m.unitsPerEm).toFixed(3)} descent=${(Math.abs(m.descender)/m.unitsPerEm).toFixed(3)} xHeight=${m.xHeight ? (m.xHeight/m.unitsPerEm).toFixed(3) : "n/a"} capHeight=${m.capHeight ? (m.capHeight/m.unitsPerEm).toFixed(3) : "n/a"}`);
  } catch (e) { console.log(p, "ERROR", e.message); }
}
