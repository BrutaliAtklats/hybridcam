import { RawDepthSource } from "./reliefProcessor";

/**
 * Parse a Binary or ASCII .STL file into a normalized [0, 1] RawDepthSource heightmap
 * by rasterizing every triangle's top Z onto a `gridRes × gridRes` buffer.
 */
export function parseStlToDepthSource(
  buffer: ArrayBuffer,
  label: string,
  gridRes = 384
): RawDepthSource {
  const tris: number[] = [];
  const bytes = new Uint8Array(buffer);

  const isBinary = (() => {
    if (buffer.byteLength < 84) return false;
    const view = new DataView(buffer);
    const triCount = view.getUint32(80, true);
    return 84 + triCount * 50 === buffer.byteLength;
  })();

  if (isBinary) {
    const view = new DataView(buffer);
    const triCount = view.getUint32(80, true);
    for (let i = 0; i < triCount; i++) {
      const off = 84 + i * 50 + 12; // skip 12-byte normal
      for (let v = 0; v < 9; v++) {
        tris.push(view.getFloat32(off + v * 4, true));
      }
    }
  } else {
    const text = new TextDecoder().decode(bytes);
    const re = /vertex\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      tris.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
    }
  }

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < tris.length; i += 3) {
    const x = tris[i], y = tris[i + 1], z = tris[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const spanX = Math.max(1e-4, maxX - minX);
  const spanY = Math.max(1e-4, maxY - minY);
  const spanZ = Math.max(1e-4, maxZ - minZ);
  const aspect = spanX / spanY;
  const w = aspect >= 1 ? gridRes : Math.max(64, Math.round(gridRes * aspect));
  const h = aspect >= 1 ? Math.max(64, Math.round(gridRes / aspect)) : gridRes;

  const data = new Float32Array(w * h);
  const scaleX = (w - 1) / spanX;
  const scaleY = (h - 1) / spanY;

  for (let i = 0; i + 8 < tris.length; i += 9) {
    const ax = (tris[i] - minX) * scaleX;
    const ay = (maxY - tris[i + 1]) * scaleY;
    const az = (tris[i + 2] - minZ) / spanZ;
    const bx = (tris[i + 3] - minX) * scaleX;
    const by = (maxY - tris[i + 4]) * scaleY;
    const bz = (tris[i + 5] - minZ) / spanZ;
    const cx = (tris[i + 6] - minX) * scaleX;
    const cy = (maxY - tris[i + 7]) * scaleY;
    const cz = (tris[i + 8] - minZ) / spanZ;

    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by, cy)));

    const denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(denom) < 1e-6) continue;
    const inv = 1 / denom;

    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const w1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) * inv;
        const w2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) * inv;
        const w3 = 1 - w1 - w2;
        if (w1 >= -0.001 && w2 >= -0.001 && w3 >= -0.001) {
          const zNorm = Math.max(0, Math.min(1, w1 * az + w2 * bz + w3 * cz));
          const idx = py * w + px;
          if (zNorm > data[idx]) data[idx] = zNorm;
        }
      }
    }
  }

  return { label, width: w, height: h, data };
}
