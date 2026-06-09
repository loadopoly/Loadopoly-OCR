/**
 * Minimal ZIP writer — STORE method only, zero dependencies.
 *
 * Capture bundles are mostly JPEGs, which are already compressed, so a
 * store-only archive loses nothing while keeping the app free of a zip
 * library. Produces a standards-compliant archive (PKZIP 2.0: local file
 * headers + central directory + EOCD) readable by Windows Explorer, Python
 * `zipfile`, and the Supply Chain Brain intake.
 */

interface ZipEntry {
  name: string;
  data: Uint8Array;
  crc: number;
  offset: number;
  dosTime: number;
  dosDate: number;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date: Date): { dosTime: number; dosDate: number } {
  return {
    dosTime:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    dosDate:
      ((date.getFullYear() - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate(),
  };
}

export class ZipWriter {
  private entries: ZipEntry[] = [];
  private chunks: Uint8Array[] = [];
  private offset = 0;

  async addFile(name: string, content: Blob | Uint8Array | string): Promise<void> {
    let data: Uint8Array;
    if (typeof content === 'string') {
      data = new TextEncoder().encode(content);
    } else if (content instanceof Uint8Array) {
      data = content;
    } else {
      data = new Uint8Array(await content.arrayBuffer());
    }

    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(data);
    const { dosTime, dosDate } = toDosDateTime(new Date());

    // Local file header (30 bytes + name) — method 0 (STORE)
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);            // version needed
    header.setUint16(6, 0x0800, true);        // UTF-8 names
    header.setUint16(8, 0, true);             // method: STORE
    header.setUint16(10, dosTime, true);
    header.setUint16(12, dosDate, true);
    header.setUint32(14, crc, true);
    header.setUint32(18, data.length, true);  // compressed
    header.setUint32(22, data.length, true);  // uncompressed
    header.setUint16(26, nameBytes.length, true);
    header.setUint16(28, 0, true);            // extra length

    this.entries.push({
      name,
      data,
      crc,
      offset: this.offset,
      dosTime,
      dosDate,
    });
    this.push(new Uint8Array(header.buffer));
    this.push(nameBytes);
    this.push(data);
  }

  private push(bytes: Uint8Array) {
    this.chunks.push(bytes);
    this.offset += bytes.length;
  }

  finalize(): Blob {
    const cdStart = this.offset;
    for (const e of this.entries) {
      const nameBytes = new TextEncoder().encode(e.name);
      const rec = new DataView(new ArrayBuffer(46));
      rec.setUint32(0, 0x02014b50, true);
      rec.setUint16(4, 20, true);             // version made by
      rec.setUint16(6, 20, true);             // version needed
      rec.setUint16(8, 0x0800, true);         // UTF-8 names
      rec.setUint16(10, 0, true);             // method: STORE
      rec.setUint16(12, e.dosTime, true);
      rec.setUint16(14, e.dosDate, true);
      rec.setUint32(16, e.crc, true);
      rec.setUint32(20, e.data.length, true);
      rec.setUint32(24, e.data.length, true);
      rec.setUint16(28, nameBytes.length, true);
      rec.setUint32(42, e.offset, true);
      this.push(new Uint8Array(rec.buffer));
      this.push(nameBytes);
    }
    const cdSize = this.offset - cdStart;

    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(8, this.entries.length, true);
    eocd.setUint16(10, this.entries.length, true);
    eocd.setUint32(12, cdSize, true);
    eocd.setUint32(16, cdStart, true);
    this.push(new Uint8Array(eocd.buffer));

    return new Blob(this.chunks as BlobPart[], { type: 'application/zip' });
  }
}
