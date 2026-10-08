"use client";
/** Minimal dependency-free ZIP writer (stored entries, CRC32). */
function crc(data: Uint8Array) {
  let t = (crc as unknown as { t?: Uint32Array }).t;
  if (!t) {
    t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    (crc as unknown as { t: Uint32Array }).t = t;
  }
  let r = 0xffffffff;
  for (let i = 0; i < data.length; i++) r = t[(r ^ data[i]) & 0xff] ^ (r >>> 8);
  return (r ^ 0xffffffff) >>> 0;
}
export async function filesToZip(files: Array<{ name: string; blob: Blob }>): Promise<Blob> {
  const te = new TextEncoder();
  const now = new Date();
  const dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
  const locals: BlobPart[] = [];
  const centrals: BlobPart[] = [];
  let run = 0;
  const bufs: Uint8Array<ArrayBuffer>[] = [];
  for (const f of files) bufs.push(new Uint8Array(await f.blob.arrayBuffer()));
  for (let i = 0; i < files.length; i++) {
    const nm = te.encode(files[i].name);
    const buf = bufs[i];
    const c = crc(buf);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dt, true); lh.setUint16(12, dd, true);
    lh.setUint32(14, c, true); lh.setUint32(18, buf.length, true); lh.setUint32(22, buf.length, true);
    lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
    locals.push(lh.buffer, nm, buf);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true); ch.setUint16(12, dt, true); ch.setUint16(14, dd, true);
    ch.setUint32(16, c, true); ch.setUint32(20, buf.length, true); ch.setUint32(24, buf.length, true);
    ch.setUint16(28, nm.length, true); ch.setUint32(42, run, true);
    centrals.push(ch.buffer, nm);
    run += 30 + nm.length + buf.length;
  }
  const cd = new Blob(centrals, { type: "application/zip" });
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cd.size, true); end.setUint32(16, run, true);
  return new Blob([...locals, ...centrals, end.buffer], { type: "application/zip" });
}
