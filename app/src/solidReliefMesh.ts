import * as THREE from "three";

/**
 * Build a watertight solid 3D stock mesh:
 * - High-res carved top surface (`mw × mh`) with crevice/valley AO shading
 * - Optional Base Removal (`mask`): clips out masked background triangles and adds a clean silhouette skirt
 * - 4 solid vertical side walls + closed bottom face when in Solid mode
 */
export function buildSolidStockGeometry(
  widthMm: number,
  depthMm: number,
  mw: number,
  mh: number,
  bottomZ: number,
  getZ: (idx: number) => number,
  getNormH: (idx: number) => number,
  mode: "clay" | "material" | "heatmap" | "wireframe",
  baseColorHex: number,
  mask?: Uint8Array,
  customColorFn?: (idx: number) => [number, number, number]
): THREE.BufferGeometry {
  const topCount = mw * mh;
  const topGeo = new THREE.PlaneGeometry(widthMm, depthMm, mw - 1, mh - 1);
  const topPos = topGeo.attributes.position as THREE.BufferAttribute;

  for (let i = 0; i < topCount; i++) {
    topPos.setZ(i, getZ(i));
  }
  topGeo.computeVertexNormals();
  const topNormals = topGeo.attributes.normal as THREE.BufferAttribute;

  const baseColor = new THREE.Color(baseColorHex);
  const clayColor = new THREE.Color(0xc2c8d2);
  const topColors = new Float32Array(topCount * 3);

  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const i = y * mw + x;
      const h = getNormH(i);

      if (customColorFn) {
        const [cr, cg, cb] = customColorFn(i);
        topColors[i * 3] = cr;
        topColors[i * 3 + 1] = cg;
        topColors[i * 3 + 2] = cb;
      } else if (mode === "heatmap") {
        topColors[i * 3] = Math.min(1, Math.max(0, h * 2 - 0.5));
        topColors[i * 3 + 1] = Math.sin(h * Math.PI);
        topColors[i * 3 + 2] = Math.min(1, Math.max(0, 1.2 - h * 2));
      } else {
        const hL = getNormH(y * mw + Math.max(0, x - 1));
        const hR = getNormH(y * mw + Math.min(mw - 1, x + 1));
        const hU = getNormH(Math.max(0, y - 1) * mw + x);
        const hD = getNormH(Math.min(mh - 1, y + 1) * mw + x);
        const avgNeighbor = (hL + hR + hU + hD) * 0.25;
        const cavity = Math.max(-0.25, Math.min(0.25, h - avgNeighbor));
        const ao = Math.max(0.48, Math.min(1.15, 0.72 + h * 0.30 + cavity * 2.4));
        const c = mode === "clay" ? clayColor : baseColor;
        topColors[i * 3] = Math.min(1, c.r * ao);
        topColors[i * 3 + 1] = Math.min(1, c.g * ao);
        topColors[i * 3 + 2] = Math.min(1, c.b * ao);
      }
    }
  }

  const topIdx = topGeo.index!;
  const sideBase = mode === "clay" ? new THREE.Color(0x8c939e) : baseColor.clone().multiplyScalar(0.75);

  if (!mask) {
    // Fast pre-allocated typed arrays (zero JS array push churn at 1024px–1536px)
    const sideQuadCount = (mw - 1) * 2 + (mh - 1) * 2 + 1;
    const totalVerts = topCount + sideQuadCount * 4;
    const totalIdx = topIdx.count + sideQuadCount * 6;

    const posArr = new Float32Array(totalVerts * 3);
    const normArr = new Float32Array(totalVerts * 3);
    const colArr = new Float32Array(totalVerts * 3);
    const idxArr = new Uint32Array(totalIdx);

    posArr.set(topPos.array as Float32Array, 0);
    normArr.set(topNormals.array as Float32Array, 0);
    colArr.set(topColors, 0);
    for (let i = 0; i < topIdx.count; i++) {
      idxArr[i] = topIdx.getX(i);
    }

    let vCursor = topCount;
    let iCursor = topIdx.count;
    const writeQuad = (
      p0x: number, p0y: number, p0z: number,
      p1x: number, p1y: number, p1z: number,
      p2x: number, p2y: number, p2z: number,
      p3x: number, p3y: number, p3z: number,
      nx: number, ny: number, nz: number
    ) => {
      const base = vCursor;
      const pts = [p0x, p0y, p0z, p1x, p1y, p1z, p2x, p2y, p2z, p3x, p3y, p3z];
      for (let k = 0; k < 4; k++) {
        const vo = (vCursor + k) * 3;
        posArr[vo] = pts[k * 3];
        posArr[vo + 1] = pts[k * 3 + 1];
        posArr[vo + 2] = pts[k * 3 + 2];
        normArr[vo] = nx;
        normArr[vo + 1] = ny;
        normArr[vo + 2] = nz;
        colArr[vo] = sideBase.r;
        colArr[vo + 1] = sideBase.g;
        colArr[vo + 2] = sideBase.b;
      }
      idxArr[iCursor++] = base;
      idxArr[iCursor++] = base + 1;
      idxArr[iCursor++] = base + 2;
      idxArr[iCursor++] = base;
      idxArr[iCursor++] = base + 2;
      idxArr[iCursor++] = base + 3;
      vCursor += 4;
    };

    const topArr = topPos.array as Float32Array;
    for (let x = 0; x < mw - 1; x++) {
      const a = x * 3;
      const b = (x + 1) * 3;
      writeQuad(topArr[a], topArr[a + 1], bottomZ, topArr[b], topArr[b + 1], bottomZ, topArr[b], topArr[b + 1], topArr[b + 2], topArr[a], topArr[a + 1], topArr[a + 2], 0, 1, 0);
    }
    const rowBot = (mh - 1) * mw;
    for (let x = 0; x < mw - 1; x++) {
      const a = (rowBot + x) * 3;
      const b = (rowBot + x + 1) * 3;
      writeQuad(topArr[a], topArr[a + 1], topArr[a + 2], topArr[b], topArr[b + 1], topArr[b + 2], topArr[b], topArr[b + 1], bottomZ, topArr[a], topArr[a + 1], bottomZ, 0, -1, 0);
    }
    for (let y = 0; y < mh - 1; y++) {
      const a = (y * mw) * 3;
      const b = ((y + 1) * mw) * 3;
      writeQuad(topArr[a], topArr[a + 1], topArr[a + 2], topArr[a], topArr[a + 1], bottomZ, topArr[b], topArr[b + 1], bottomZ, topArr[b], topArr[b + 1], topArr[b + 2], -1, 0, 0);
    }
    for (let y = 0; y < mh - 1; y++) {
      const a = (y * mw + mw - 1) * 3;
      const b = ((y + 1) * mw + mw - 1) * 3;
      writeQuad(topArr[a], topArr[a + 1], bottomZ, topArr[a], topArr[a + 1], topArr[a + 2], topArr[b], topArr[b + 1], topArr[b + 2], topArr[b], topArr[b + 1], bottomZ, 1, 0, 0);
    }

    const hw = widthMm * 0.5;
    const hd = depthMm * 0.5;
    writeQuad(-hw, -hd, bottomZ, -hw, hd, bottomZ, hw, hd, bottomZ, hw, -hd, bottomZ, 0, 0, -1);

    topGeo.dispose();
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    geom.setAttribute("normal", new THREE.BufferAttribute(normArr, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
    geom.setIndex(new THREE.BufferAttribute(idxArr, 1));
    return geom;
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < topCount; i++) {
    positions.push(topPos.getX(i), topPos.getY(i), topPos.getZ(i));
    normals.push(topNormals.getX(i), topNormals.getY(i), topNormals.getZ(i));
    colors.push(topColors[i * 3], topColors[i * 3 + 1], topColors[i * 3 + 2]);
  }

  for (let i = 0; i < topIdx.count; i += 3) {
    const a = topIdx.getX(i);
    const b = topIdx.getX(i + 1);
    const c = topIdx.getX(i + 2);
    if (mask[a] === 1 && mask[b] === 1 && mask[c] === 1) {
      indices.push(a, b, c);
    }
  }

  const pushQuad = (
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number],
    n: [number, number, number]
  ) => {
    const base = positions.length / 3;
    for (const p of [p0, p1, p2, p3]) {
      positions.push(p[0], p[1], p[2]);
      normals.push(n[0], n[1], n[2]);
      colors.push(sideBase.r, sideBase.g, sideBase.b);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  {
    // Base Removal mode: add closed bottom for kept cells + watertight vertical walls on all outer & inner hole boundaries
    const botBase = positions.length / 3;
    for (let i = 0; i < topCount; i++) {
      positions.push(topPos.getX(i), topPos.getY(i), bottomZ);
      normals.push(0, 0, -1);
      colors.push(sideBase.r, sideBase.g, sideBase.b);
    }

    const keptEdges = new Set<number>();
    for (let i = 0; i < topIdx.count; i += 3) {
      const a = topIdx.getX(i);
      const b = topIdx.getX(i + 1);
      const c = topIdx.getX(i + 2);
      if (mask[a] === 1 && mask[b] === 1 && mask[c] === 1) {
        indices.push(botBase + a, botBase + c, botBase + b);
        keptEdges.add(a * topCount + b);
        keptEdges.add(b * topCount + c);
        keptEdges.add(c * topCount + a);
      }
    }

    for (const key of keptEdges) {
      const u = Math.floor(key / topCount);
      const v = key - u * topCount;
      if (!keptEdges.has(v * topCount + u)) {
        const ux = topPos.getX(u);
        const uy = topPos.getY(u);
        const uz = topPos.getZ(u);
        const vx = topPos.getX(v);
        const vy = topPos.getY(v);
        const vz = topPos.getZ(v);
        const dx = vx - ux;
        const dy = vy - uy;
        const len = Math.hypot(dx, dy) || 1;
        pushQuad(
          [ux, uy, uz],
          [ux, uy, bottomZ],
          [vx, vy, bottomZ],
          [vx, vy, vz],
          [dy / len, -dx / len, 0]
        );
      }
    }
  }

  topGeo.dispose();

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geom.setIndex(indices);
  return geom;
}
