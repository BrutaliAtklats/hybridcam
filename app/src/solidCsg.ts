import * as THREE from "three";
import { shapeToPolylineMm, VectorShape } from "./vectorSketch";

export type SolidPrimitiveKind =
  | "box"
  | "cylinder"
  | "sphere"
  | "cone"
  | "torus"
  | "wedge"
  | "hole"
  | "pipe"
  | "extrude"
  | "revolve";

export type BooleanOp = "union" | "subtract" | "intersect";

export interface SolidModelNode {
  id: string;
  name: string;
  kind: SolidPrimitiveKind;
  visible: boolean;
  boolOp: BooleanOp;
  xMm: number;
  yMm: number;
  zMm: number;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  rotXDeg: number;
  rotYDeg: number;
  rotZDeg: number;
  bevelMm: number;
  sketchId?: string;
}

// ---------- Pure-TypeScript 3D BSP CSG Engine ----------

const EPS = 1e-5;

interface CsgVertex {
  pos: THREE.Vector3;
  normal: THREE.Vector3;
}

function lerpVertex(a: CsgVertex, b: CsgVertex, t: number): CsgVertex {
  return {
    pos: a.pos.clone().lerp(b.pos, t),
    normal: a.normal.clone().lerp(b.normal, t).normalize(),
  };
}

class CsgPlane {
  normal: THREE.Vector3;
  w: number;

  constructor(normal: THREE.Vector3, w: number) {
    this.normal = normal;
    this.w = w;
  }

  static fromPoints(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): CsgPlane | null {
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const len = n.length();
    if (len < 1e-8) return null;
    n.divideScalar(len);
    return new CsgPlane(n, n.dot(a));
  }

  clone(): CsgPlane {
    return new CsgPlane(this.normal.clone(), this.w);
  }

  flip(): void {
    this.normal.negate();
    this.w = -this.w;
  }

  splitPolygon(
    poly: CsgPolygon,
    coplanarFront: CsgPolygon[],
    coplanarBack: CsgPolygon[],
    front: CsgPolygon[],
    back: CsgPolygon[]
  ): void {
    const COPLANAR = 0;
    const FRONT = 1;
    const BACK = 2;
    const SPANNING = 3;

    let polygonType = 0;
    const types: number[] = [];
    for (let i = 0; i < poly.vertices.length; i++) {
      const t = this.normal.dot(poly.vertices[i].pos) - this.w;
      const type = t < -EPS ? BACK : t > EPS ? FRONT : COPLANAR;
      polygonType |= type;
      types.push(type);
    }

    if (polygonType === COPLANAR) {
      if (this.normal.dot(poly.plane.normal) > 0) coplanarFront.push(poly);
      else coplanarBack.push(poly);
    } else if (polygonType === FRONT) {
      front.push(poly);
    } else if (polygonType === BACK) {
      back.push(poly);
    } else if (polygonType === SPANNING) {
      const f: CsgVertex[] = [];
      const b: CsgVertex[] = [];
      for (let i = 0; i < poly.vertices.length; i++) {
        const j = (i + 1) % poly.vertices.length;
        const ti = types[i];
        const tj = types[j];
        const vi = poly.vertices[i];
        const vj = poly.vertices[j];
        if (ti !== BACK) f.push(vi);
        if (ti !== FRONT) b.push(ti !== BACK ? { pos: vi.pos.clone(), normal: vi.normal.clone() } : vi);
        if ((ti | tj) === SPANNING) {
          const denom = this.normal.dot(vj.pos.clone().sub(vi.pos));
          const t = Math.abs(denom) > 1e-12 ? (this.w - this.normal.dot(vi.pos)) / denom : 0.5;
          const v = lerpVertex(vi, vj, Math.max(0, Math.min(1, t)));
          f.push(v);
          b.push({ pos: v.pos.clone(), normal: v.normal.clone() });
        }
      }
      if (f.length >= 3) front.push(new CsgPolygon(f));
      if (b.length >= 3) back.push(new CsgPolygon(b));
    }
  }
}

class CsgPolygon {
  vertices: CsgVertex[];
  plane: CsgPlane;

  constructor(vertices: CsgVertex[]) {
    this.vertices = vertices;
    this.plane = CsgPlane.fromPoints(vertices[0].pos, vertices[1].pos, vertices[2].pos) || new CsgPlane(new THREE.Vector3(0, 0, 1), 0);
  }

  clone(): CsgPolygon {
    return new CsgPolygon(this.vertices.map((v) => ({ pos: v.pos.clone(), normal: v.normal.clone() })));
  }

  flip(): void {
    this.vertices.reverse();
    for (const v of this.vertices) v.normal.negate();
    this.plane.flip();
  }
}

class CsgBspNode {
  plane: CsgPlane | null = null;
  front: CsgBspNode | null = null;
  back: CsgBspNode | null = null;
  polygons: CsgPolygon[] = [];

  constructor(polygons?: CsgPolygon[]) {
    if (polygons && polygons.length) this.build(polygons);
  }

  clone(): CsgBspNode {
    const node = new CsgBspNode();
    node.plane = this.plane ? this.plane.clone() : null;
    node.front = this.front ? this.front.clone() : null;
    node.back = this.back ? this.back.clone() : null;
    node.polygons = this.polygons.map((p) => p.clone());
    return node;
  }

  invert(): void {
    for (const p of this.polygons) p.flip();
    if (this.plane) this.plane.flip();
    if (this.front) this.front.invert();
    if (this.back) this.back.invert();
    const tmp = this.front;
    this.front = this.back;
    this.back = tmp;
  }

  clipPolygons(polygons: CsgPolygon[]): CsgPolygon[] {
    if (!this.plane) return polygons.slice();
    let front: CsgPolygon[] = [];
    let back: CsgPolygon[] = [];
    for (const p of polygons) {
      this.plane.splitPolygon(p, front, back, front, back);
    }
    if (this.front) front = this.front.clipPolygons(front);
    if (this.back) back = this.back.clipPolygons(back);
    else back = [];
    return front.concat(back);
  }

  clipTo(bsp: CsgBspNode): void {
    this.polygons = bsp.clipPolygons(this.polygons);
    if (this.front) this.front.clipTo(bsp);
    if (this.back) this.back.clipTo(bsp);
  }

  allPolygons(): CsgPolygon[] {
    let list = this.polygons.slice();
    if (this.front) list = list.concat(this.front.allPolygons());
    if (this.back) list = list.concat(this.back.allPolygons());
    return list;
  }

  build(polygons: CsgPolygon[], depth = 0): void {
    if (!polygons.length) return;
    if (!this.plane) this.plane = polygons[0].plane.clone();
    if (depth > 48) {
      this.polygons.push(...polygons);
      return;
    }
    const front: CsgPolygon[] = [];
    const back: CsgPolygon[] = [];
    for (const p of polygons) {
      this.plane.splitPolygon(p, this.polygons, this.polygons, front, back);
    }
    if (front.length) {
      if (!this.front) this.front = new CsgBspNode();
      this.front.build(front, depth + 1);
    }
    if (back.length) {
      if (!this.back) this.back = new CsgBspNode();
      this.back.build(back, depth + 1);
    }
  }
}

function geometryToPolygons(geom: THREE.BufferGeometry): CsgPolygon[] {
  const nonIdx = geom.index ? geom.toNonIndexed() : geom;
  const pos = nonIdx.attributes.position as THREE.BufferAttribute;
  if (!nonIdx.attributes.normal) nonIdx.computeVertexNormals();
  const norm = nonIdx.attributes.normal as THREE.BufferAttribute;

  const polys: CsgPolygon[] = [];
  for (let i = 0; i < pos.count; i += 3) {
    const v0: CsgVertex = {
      pos: new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)),
      normal: new THREE.Vector3(norm.getX(i), norm.getY(i), norm.getZ(i)),
    };
    const v1: CsgVertex = {
      pos: new THREE.Vector3(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)),
      normal: new THREE.Vector3(norm.getX(i + 1), norm.getY(i + 1), norm.getZ(i + 1)),
    };
    const v2: CsgVertex = {
      pos: new THREE.Vector3(pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2)),
      normal: new THREE.Vector3(norm.getX(i + 2), norm.getY(i + 2), norm.getZ(i + 2)),
    };
    if (CsgPlane.fromPoints(v0.pos, v1.pos, v2.pos)) {
      polys.push(new CsgPolygon([v0, v1, v2]));
    }
  }
  if (nonIdx !== geom) nonIdx.dispose();
  return polys;
}

function polygonsToGeometry(polys: CsgPolygon[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  for (const p of polys) {
    for (let i = 2; i < p.vertices.length; i++) {
      const tri = [p.vertices[0], p.vertices[i - 1], p.vertices[i]];
      for (const v of tri) {
        positions.push(v.pos.x, v.pos.y, v.pos.z);
        normals.push(v.normal.x, v.normal.y, v.normal.z);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return g;
}

function csgBoolean(aGeom: THREE.BufferGeometry, bGeom: THREE.BufferGeometry, op: BooleanOp): THREE.BufferGeometry {
  const a = new CsgBspNode(geometryToPolygons(aGeom));
  const b = new CsgBspNode(geometryToPolygons(bGeom));

  if (op === "union") {
    a.clipTo(b);
    b.clipTo(a);
    b.invert();
    b.clipTo(a);
    b.invert();
    a.build(b.allPolygons());
    return polygonsToGeometry(a.allPolygons());
  } else if (op === "subtract") {
    a.invert();
    a.clipTo(b);
    b.clipTo(a);
    b.invert();
    b.clipTo(a);
    b.invert();
    a.build(b.allPolygons());
    a.invert();
    return polygonsToGeometry(a.allPolygons());
  } else {
    a.invert();
    b.clipTo(a);
    b.invert();
    a.clipTo(b);
    b.clipTo(a);
    a.build(b.allPolygons());
    a.invert();
    return polygonsToGeometry(a.allPolygons());
  }
}

// ---------- 3D Primitives, Sketch Extrude & Revolve ----------

export function buildPrimitiveGeometry(node: SolidModelNode, sketches: VectorShape[]): THREE.BufferGeometry {
  const w = Math.max(1, node.widthMm);
  const d = Math.max(1, node.depthMm);
  const h = Math.max(0.5, node.heightMm);
  const bev = Math.min(node.bevelMm || 0, w * 0.25, d * 0.25, h * 0.45);
  let geo: THREE.BufferGeometry;

  if (node.kind === "box") {
    if (bev > 0.1) {
      const shape = new THREE.Shape();
      const hw = (w - bev * 2) * 0.5;
      const hd = (d - bev * 2) * 0.5;
      shape.moveTo(-hw, -hd);
      shape.lineTo(hw, -hd);
      shape.lineTo(hw, hd);
      shape.lineTo(-hw, hd);
      shape.closePath();
      geo = new THREE.ExtrudeGeometry(shape, {
        depth: Math.max(0.2, h - bev * 2),
        bevelEnabled: true,
        bevelThickness: bev,
        bevelSize: bev,
        bevelSegments: 2,
      });
      geo.center();
    } else {
      geo = new THREE.BoxGeometry(w, d, h);
    }
  } else if (node.kind === "cylinder" || node.kind === "hole") {
    geo = new THREE.CylinderGeometry(w * 0.5, w * 0.5, h, 64);
    geo.rotateX(Math.PI / 2);
    if (Math.abs(d - w) > 0.1) geo.scale(1, d / w, 1);
  } else if (node.kind === "pipe") {
    const outerR = Math.max(2, w * 0.5);
    const wall = Math.max(1.2, Math.min(outerR * 0.65, outerR * 0.28));
    const innerR = Math.max(0.6, outerR - wall);
    const shape = new THREE.Shape();
    shape.absarc(0, 0, outerR, 0, Math.PI * 2, false);
    const holePath = new THREE.Path();
    holePath.absarc(0, 0, innerR, 0, Math.PI * 2, true);
    shape.holes.push(holePath);
    geo = new THREE.ExtrudeGeometry(shape, {
      depth: h,
      bevelEnabled: bev > 0.05,
      bevelThickness: Math.min(bev, wall * 0.35),
      bevelSize: Math.min(bev, wall * 0.35),
      bevelSegments: 3,
      curveSegments: 64,
    });
    geo.center();
    if (Math.abs(d - w) > 0.1) geo.scale(1, d / w, 1);
  } else if (node.kind === "sphere") {
    geo = new THREE.SphereGeometry(0.5, 48, 32);
    geo.scale(w, d, h);
  } else if (node.kind === "cone") {
    geo = new THREE.ConeGeometry(w * 0.5, h, 64);
    geo.rotateX(Math.PI / 2);
    if (Math.abs(d - w) > 0.1) geo.scale(1, d / w, 1);
  } else if (node.kind === "torus") {
    const tube = Math.max(0.5, Math.min(w, h) * 0.22);
    const maj = Math.max(tube + 0.5, w * 0.5 - tube);
    geo = new THREE.TorusGeometry(maj, tube, 28, 64);
    if (Math.abs(d - w) > 0.1) geo.scale(1, d / w, 1);
  } else if (node.kind === "wedge") {
    const shape = new THREE.Shape();
    shape.moveTo(-w * 0.5, -h * 0.5);
    shape.lineTo(w * 0.5, -h * 0.5);
    shape.lineTo(w * 0.5, h * 0.5);
    shape.closePath();
    geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
    geo.rotateX(Math.PI / 2);
    geo.center();
  } else if (node.kind === "extrude") {
    const sk = sketches.find((s) => s.id === node.sketchId) ?? sketches[0];
    const pts = sk ? shapeToPolylineMm(sk) : [];
    const shape = new THREE.Shape();
    if (pts.length >= 3) {
      const cx = sk.xMm;
      const cy = sk.yMm;
      shape.moveTo(pts[0][0] - cx, pts[0][1] - cy);
      for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0] - cx, pts[i][1] - cy);
      shape.closePath();
    } else {
      shape.moveTo(-w * 0.5, -d * 0.5);
      shape.lineTo(w * 0.5, -d * 0.5);
      shape.lineTo(w * 0.5, d * 0.5);
      shape.lineTo(-w * 0.5, d * 0.5);
      shape.closePath();
    }
    geo = new THREE.ExtrudeGeometry(shape, {
      depth: h,
      bevelEnabled: bev > 0.05,
      bevelThickness: bev,
      bevelSize: bev,
      bevelSegments: 2,
    });
    geo.translate(0, 0, -h * 0.5);
  } else {
    // Revolve (dome/vase profile)
    const lathePts: THREE.Vector2[] = [];
    const rMax = w * 0.5;
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const rx = Math.sin(t * Math.PI) * rMax;
      const zy = (t - 0.5) * h;
      lathePts.push(new THREE.Vector2(Math.max(0.01, rx), zy));
    }
    geo = new THREE.LatheGeometry(lathePts, 64);
    geo.rotateX(Math.PI / 2);
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      ((node.rotXDeg || 0) * Math.PI) / 180,
      ((node.rotYDeg || 0) * Math.PI) / 180,
      ((node.rotZDeg || 0) * Math.PI) / 180
    )
  );
  m.compose(new THREE.Vector3(node.xMm, node.yMm, node.zMm), q, new THREE.Vector3(1, 1, 1));
  geo.applyMatrix4(m);
  return geo;
}

/**
 * Evaluate the full 3D CSG solid stack (Union / Subtract / Intersect) into a watertight BufferGeometry.
 */
export function evaluateSolidCsgStack(nodes: SolidModelNode[], sketches: VectorShape[]): THREE.BufferGeometry | null {
  const visible = nodes.filter((n) => n.visible);
  if (visible.length === 0) return null;

  let acc = buildPrimitiveGeometry(visible[0], sketches);
  for (let i = 1; i < visible.length; i++) {
    const nextGeo = buildPrimitiveGeometry(visible[i], sketches);
    const merged = csgBoolean(acc, nextGeo, visible[i].boolOp);
    acc.dispose();
    nextGeo.dispose();
    acc = merged;
  }
  acc.computeVertexNormals();
  return acc;
}

/**
 * Project a full 3D CSG solid mesh into a top-down [0..1] Z-heightfield over the stock
 * so it merges cleanly with Picture & Vector layers for 3-axis CNC machining.
 */
export function sampleSolidToHeightfield(
  geom: THREE.BufferGeometry,
  w: number,
  h: number,
  stockW: number,
  stockD: number,
  maxZMm: number
): Float32Array {
  const out = new Float32Array(w * h);
  out.fill(0);
  const pos = geom.attributes.position as THREE.BufferAttribute;
  if (!pos || pos.count < 3) return out;

  const zBuf = new Float32Array(w * h);
  zBuf.fill(-Infinity);
  const idxAttr = geom.index;
  const triCount = idxAttr ? idxAttr.count / 3 : pos.count / 3;

  const toGridX = (wx: number) => ((wx + stockW * 0.5) / Math.max(1e-6, stockW)) * (w - 1);
  const toGridY = (wy: number) => (0.5 - wy / Math.max(1e-6, stockD)) * (h - 1);

  for (let t = 0; t < triCount; t++) {
    const i0 = idxAttr ? idxAttr.getX(t * 3) : t * 3;
    const i1 = idxAttr ? idxAttr.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = idxAttr ? idxAttr.getX(t * 3 + 2) : t * 3 + 2;

    const x0 = toGridX(pos.getX(i0)), y0 = toGridY(pos.getY(i0)), z0 = pos.getZ(i0);
    const x1 = toGridX(pos.getX(i1)), y1 = toGridY(pos.getY(i1)), z1 = pos.getZ(i1);
    const x2 = toGridX(pos.getX(i2)), y2 = toGridY(pos.getY(i2)), z2 = pos.getZ(i2);

    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1, y2)));

    const denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    if (Math.abs(denom) < 1e-6) continue;

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const w0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / denom;
        const w1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / denom;
        const w2 = 1 - w0 - w1;
        if (w0 >= -0.01 && w1 >= -0.01 && w2 >= -0.01) {
          const z = w0 * z0 + w1 * z1 + w2 * z2;
          const idx = py * w + px;
          if (z > zBuf[idx]) zBuf[idx] = z;
        }
      }
    }
  }

  for (let i = 0; i < w * h; i++) {
    if (zBuf[i] > -Infinity) {
      out[i] = Math.min(1, Math.max(0, (zBuf[i] + maxZMm) / Math.max(0.5, maxZMm)));
    }
  }
  return out;
}
