// Small, deterministic STORE archives. No shell or untrusted archive paths.
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
export function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export function zipFiles(files: { name: string; data: Buffer }[]) {
  // This writer emits classic ZIP records (no ZIP64 extensions). Reject
  // archives that would wrap their 16- or 32-bit size and offset fields.
  const max16 = 0xffff;
  const max32 = 0xffffffff;
  if (files.length > max16) throw new Error("Archive has too many files");
  const local: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  const names = new Set<string>();
  for (const file of files) {
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(file.name) ||
      names.has(file.name)
    )
      throw new Error("Invalid archive filename");
    if (!Buffer.isBuffer(file.data) || file.data.length > max32)
      throw new Error("Archive file is too large");
    names.add(file.name);
    const name = Buffer.from(file.name),
      crc = crc32(file.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x21, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(file.data.length, 18);
    header.writeUInt32LE(file.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, file.data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(file.data.length, 20);
    entry.writeUInt32LE(file.data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    if (offset > max32) throw new Error("Archive is too large");
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += header.length + name.length + file.data.length;
    if (offset > max32) throw new Error("Archive is too large");
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  if (directory.length > max32 || offset + directory.length > max32)
    throw new Error("Archive is too large");
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
