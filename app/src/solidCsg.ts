import * as THREE from "three";
import { evalParamExpr } from "./parametricCad";
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
  | "revolve"
  | "loft"
  | "sweep"
  | "shell"
  | "rib"
  | "emboss"
  | "stlMesh";

export type BooleanOp = "union" | "subtract" | "intersect";

export interface SolidModelNode {
  id: string;
  name: string;
  kind: SolidPrimitiveKind;
  visible: boolean;
  suppressed?: boolean;
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
  bevelStyle?: "fillet" | "chamfer";
  holeType?: "simple" | "counterbore" | "countersink";
  counterboreDiamMm?: number;
  counterboreDepthMm?: number;
  extrudeDir?: "oneSide" | "symmetric" | "twoSides";
  heightMm2?: number;
  embossText?: string;
  customStlPositions?: number[];
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
  colorHex?: string;
  sketchId?: string;
  sketchId2?: string;
  taperDeg?: number;
  revolveDeg?: number;
  wallThicknessMm?: number;
  /** Optional parametric expressions keyed by field name (e.g. heightMm: "stock_t - wall") */
  paramExprs?: Record<string, string>;
}

/**
 * Evaluate any parametric expressions bound to a SolidModelNode against the live parameter environment.
 */
export function resolveSolidNode(node: SolidModelNode, env: Record<string, number>): SolidModelNode {
  const exprs = node.paramExprs;
  if (!exprs || Object.keys(exprs).length === 0) return node;
  const next = { ...node };
  if (exprs.xMm) next.xMm = evalParamExpr(exprs.xMm, env, node.xMm);
  if (exprs.yMm) next.yMm = evalParamExpr(exprs.yMm, env, node.yMm);
  if (exprs.zMm) next.zMm = evalParamExpr(exprs.zMm, env, node.zMm);
  if (exprs.widthMm) next.widthMm = Math.max(0.5, evalParamExpr(exprs.widthMm, env, node.widthMm));
  if (exprs.depthMm) next.depthMm = Math.max(0.5, evalParamExpr(exprs.depthMm, env, node.depthMm));
  if (exprs.heightMm) next.heightMm = Math.max(0.5, evalParamExpr(exprs.heightMm, env, node.heightMm));
  if (exprs.rotXDeg) next.rotXDeg = evalParamExpr(exprs.rotXDeg, env, node.rotXDeg);
  if (exprs.rotYDeg) next.rotYDeg = evalParamExpr(exprs.rotYDeg, env, node.rotYDeg);
  if (exprs.rotZDeg) next.rotZDeg = evalParamExpr(exprs.rotZDeg, env, node.rotZDeg);
  if (exprs.bevelMm) next.bevelMm = Math.max(0, evalParamExpr(exprs.bevelMm, env, node.bevelMm));
  if (exprs.wallThicknessMm) next.wallThicknessMm = Math.max(0.5, evalParamExpr(exprs.wallThicknessMm, env, node.wallThicknessMm ?? 3));
  if (exprs.taperDeg) next.taperDeg = Math.max(-45, Math.min(45, evalParamExpr(exprs.taperDeg, env, node.taperDeg ?? 0)));
  if (exprs.revolveDeg) next.revolveDeg = Math.max(15, Math.min(360, evalParamExpr(exprs.revolveDeg, env, node.revolveDeg ?? 360)));
  return next;
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
  const w = Math.max(1, node.widthMm * (node.scaleX ?? 1));
  const d = Math.max(1, node.depthMm * (node.scaleY ?? 1));
  const h = Math.max(0.5, node.heightMm * (node.scaleZ ?? 1));
  const bev = Math.min(node.bevelMm || 0, w * 0.25, d * 0.25, h * 0.45);
  const bevSegs = node.bevelStyle === "chamfer" ? 1 : 4;
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
        bevelSegments: bevSegs,
      });
      geo.center();
    } else {
      geo = new THREE.BoxGeometry(w, d, h);
    }
    if (Math.abs(node.taperDeg || 0) > 0.1) {
      const tanA = Math.tan(((node.taperDeg || 0) * Math.PI) / 180);
      const posAttr = geo.attributes.position;
      const maxR = Math.max(1, Math.max(w, d) * 0.5);
      for (let i = 0; i < posAttr.count; i++) {
        const z = posAttr.getZ(i);
        const t = (z + h * 0.5) / Math.max(0.01, h);
        const sc = Math.max(0.1, 1 - (t * h * tanA) / maxR);
        posAttr.setX(i, posAttr.getX(i) * sc);
        posAttr.setY(i, posAttr.getY(i) * sc);
      }
      posAttr.needsUpdate = true;
      geo.computeVertexNormals();
    }
  } else if (node.kind === "hole") {
    const shaft = new THREE.CylinderGeometry(w * 0.5, w * 0.5, h, 64);
    shaft.rotateX(Math.PI / 2);
    if (node.holeType === "counterbore") {
      const cbD = Math.max(w * 1.15, node.counterboreDiamMm ?? w * 1.6);
      const cbH = Math.max(1, Math.min(h * 0.8, node.counterboreDepthMm ?? 4));
      const head = new THREE.CylinderGeometry(cbD * 0.5, cbD * 0.5, cbH, 64);
      head.rotateX(Math.PI / 2);
      head.translate(0, 0, h * 0.5 - cbH * 0.5);
      geo = csgBoolean(shaft, head, "union");
      shaft.dispose();
      head.dispose();
    } else if (node.holeType === "countersink") {
      const csD = Math.max(w * 1.2, node.counterboreDiamMm ?? w * 1.8);
      const csH = Math.max(1, Math.min(h * 0.7, node.counterboreDepthMm ?? (csD - w) * 0.5));
      const head = new THREE.CylinderGeometry(csD * 0.5, w * 0.5, csH, 64);
      head.rotateX(Math.PI / 2);
      head.translate(0, 0, h * 0.5 - csH * 0.5);
      geo = csgBoolean(shaft, head, "union");
      shaft.dispose();
      head.dispose();
    } else {
      geo = shaft;
    }
    if (Math.abs(d - w) > 0.1) geo.scale(1, d / w, 1);
  } else if (node.kind === "cylinder") {
    const rBot = w * 0.5;
    const taper = node.taperDeg || 0;
    const rTop = Math.max(0.2, rBot - Math.tan((taper * Math.PI) / 180) * h);
    geo = new THREE.CylinderGeometry(rTop, rBot, h, 64);
    geo.rotateX(Math.PI / 2);
    if (Math.abs(d - w) > 0.1) geo.scale(1, d / w, 1);
  } else if (node.kind === "emboss") {
    geo = buildBlockTextGeometry(node.embossText || "HYBRIDCAM", w, d, h);
  } else if (node.kind === "stlMesh" && node.customStlPositions && node.customStlPositions.length >= 9) {
    geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(node.customStlPositions, 3));
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const sz = new THREE.Vector3();
    bb.getSize(sz);
    geo.center();
    const sx = sz.x > 1e-4 ? w / sz.x : 1;
    const sy = sz.y > 1e-4 ? d / sz.y : 1;
    const szScale = sz.z > 1e-4 ? h / sz.z : 1;
    geo.scale(sx, sy, szScale);
    geo.computeVertexNormals();
  } else if (node.kind === "rib") {
    const wall = Math.max(1, node.wallThicknessMm ?? 3);
    geo = new THREE.BoxGeometry(w, wall, h);
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
    const totalH =
      node.extrudeDir === "symmetric"
        ? h * 2
        : node.extrudeDir === "twoSides"
        ? h + Math.max(0.5, node.heightMm2 ?? h * 0.5)
        : h;
    geo = new THREE.ExtrudeGeometry(shape, {
      depth: totalH,
      bevelEnabled: bev > 0.05,
      bevelThickness: bev,
      bevelSize: bev,
      bevelSegments: bevSegs,
      steps: Math.abs(node.taperDeg || 0) > 0.1 ? 4 : 1,
    });
    geo.translate(0, 0, -totalH * 0.5);
    const taper = node.taperDeg || 0;
    if (Math.abs(taper) > 0.1) {
      const tanA = Math.tan((taper * Math.PI) / 180);
      const posAttr = geo.attributes.position;
      const maxR = Math.max(1, Math.max(w, d) * 0.5);
      for (let i = 0; i < posAttr.count; i++) {
        const z = posAttr.getZ(i);
        const t = (z + h * 0.5) / Math.max(0.01, h);
        const scale = Math.max(0.08, 1 - (t * h * tanA) / maxR);
        posAttr.setX(i, posAttr.getX(i) * scale);
        posAttr.setY(i, posAttr.getY(i) * scale);
      }
      posAttr.needsUpdate = true;
      geo.computeVertexNormals();
    }
  } else if (node.kind === "loft") {
    // Smooth multi-section loft between bottom profile and top profile
    const resampleRing = (pts2d: [number, number][], n: number): [number, number][] => {
      if (pts2d.length < 3) {
        const out: [number, number][] = [];
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          out.push([Math.cos(a) * w * 0.5, Math.sin(a) * d * 0.5]);
        }
        return out;
      }
      const out: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        const f = (i / n) * pts2d.length;
        const i0 = Math.floor(f) % pts2d.length;
        const i1 = (i0 + 1) % pts2d.length;
        const frac = f - Math.floor(f);
        out.push([
          pts2d[i0][0] * (1 - frac) + pts2d[i1][0] * frac,
          pts2d[i0][1] * (1 - frac) + pts2d[i1][1] * frac,
        ]);
      }
      return out;
    };
    const N = 48;
    const sk1 = sketches.find((s) => s.id === node.sketchId) ?? sketches[0];
    const sk2 = sketches.find((s) => s.id === node.sketchId2);
    const botRaw: [number, number][] = sk1
      ? shapeToPolylineMm(sk1).map(([px, py]) => [px - sk1.xMm, py - sk1.yMm])
      : [[-w * 0.5, -d * 0.5], [w * 0.5, -d * 0.5], [w * 0.5, d * 0.5], [-w * 0.5, d * 0.5]];
    const topRaw: [number, number][] = sk2
      ? shapeToPolylineMm(sk2).map(([px, py]) => [px - sk2.xMm, py - sk2.yMm])
      : Array.from({ length: N }, (_, i) => {
          const a = (i / N) * Math.PI * 2;
          const rScale = Math.max(0.15, 1 - Math.tan(((node.taperDeg ?? 18) * Math.PI) / 180) * 0.65);
          return [Math.cos(a) * w * 0.5 * rScale, Math.sin(a) * d * 0.5 * rScale] as [number, number];
        });
    const bot = resampleRing(botRaw, N);
    const top = resampleRing(topRaw, N);
    const pos: number[] = [];
    const rings = 8;
    for (let r = 0; r < rings; r++) {
      const t0 = r / rings;
      const t1 = (r + 1) / rings;
      const z0 = (t0 - 0.5) * h;
      const z1 = (t1 - 0.5) * h;
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const a0x = bot[i][0] * (1 - t0) + top[i][0] * t0;
        const a0y = bot[i][1] * (1 - t0) + top[i][1] * t0;
        const b0x = bot[j][0] * (1 - t0) + top[j][0] * t0;
        const b0y = bot[j][1] * (1 - t0) + top[j][1] * t0;
        const a1x = bot[i][0] * (1 - t1) + top[i][0] * t1;
        const a1y = bot[i][1] * (1 - t1) + top[i][1] * t1;
        const b1x = bot[j][0] * (1 - t1) + top[j][0] * t1;
        const b1y = bot[j][1] * (1 - t1) + top[j][1] * t1;
        pos.push(a0x, a0y, z0, b0x, b0y, z0, b1x, b1y, z1);
        pos.push(a0x, a0y, z0, b1x, b1y, z1, a1x, a1y, z1);
      }
    }
    // Bottom & top caps
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      pos.push(0, 0, -h * 0.5, bot[j][0], bot[j][1], -h * 0.5, bot[i][0], bot[i][1], -h * 0.5);
      pos.push(0, 0, h * 0.5, top[i][0], top[i][1], h * 0.5, top[j][0], top[j][1], h * 0.5);
    }
    geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
  } else if (node.kind === "sweep") {
    // Sweep circular profile along sketch polyline or smooth S-curve
    const sk = sketches.find((s) => s.id === node.sketchId);
    const pts2d = sk ? shapeToPolylineMm(sk) : [];
    const curvePts: THREE.Vector3[] =
      pts2d.length >= 2
        ? pts2d.map(([px, py]) => new THREE.Vector3(px - (sk?.xMm ?? 0), py - (sk?.yMm ?? 0), 0))
        : [
            new THREE.Vector3(-w * 0.5, -d * 0.3, -h * 0.3),
            new THREE.Vector3(-w * 0.15, d * 0.35, 0),
            new THREE.Vector3(w * 0.15, -d * 0.35, 0),
            new THREE.Vector3(w * 0.5, d * 0.3, h * 0.3),
          ];
    const curve = new THREE.CatmullRomCurve3(curvePts);
    const radius = Math.max(0.8, (node.wallThicknessMm ?? 4) * 0.5);
    geo = new THREE.TubeGeometry(curve, 64, radius, 24, false);
    geo.center();
  } else if (node.kind === "shell") {
    // Hollow open-top enclosure with exact wallThicknessMm
    const wall = Math.max(0.8, Math.min(node.wallThicknessMm ?? 3, w * 0.4, d * 0.4, h * 0.45));
    const outer = new THREE.BoxGeometry(w, d, h);
    const inner = new THREE.BoxGeometry(Math.max(0.5, w - wall * 2), Math.max(0.5, d - wall * 2), Math.max(0.5, h));
    inner.translate(0, 0, wall);
    geo = csgBoolean(outer, inner, "subtract");
    outer.dispose();
    inner.dispose();
  } else {
    // Revolve (dome/vase profile with configurable revolveDeg)
    const lathePts: THREE.Vector2[] = [];
    const rMax = w * 0.5;
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const rx = Math.sin(t * Math.PI) * rMax;
      const zy = (t - 0.5) * h;
      lathePts.push(new THREE.Vector2(Math.max(0.01, rx), zy));
    }
    const phiLen = (Math.max(15, Math.min(360, node.revolveDeg ?? 360)) * Math.PI) / 180;
    geo = new THREE.LatheGeometry(lathePts, 64, 0, phiLen);
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
  const visible = nodes.filter((n) => n.visible && !n.suppressed);
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

const FONT_5X7: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10011", "10101", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["01110", "10000", "11110", "10001", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

function buildBlockTextGeometry(rawText: string, w: number, d: number, h: number): THREE.BufferGeometry {
  const txt = (rawText.trim().toUpperCase() || "CNC").slice(0, 16);
  const cols = txt.length * 6 - 1;
  const rows = 7;
  const cellW = w / Math.max(1, cols);
  const cellD = d / rows;
  const positions: number[] = [];

  const pushBox = (cx: number, cy: number, bw: number, bd: number, bh: number) => {
    const x0 = cx - bw * 0.5, x1 = cx + bw * 0.5;
    const y0 = cy - bd * 0.5, y1 = cy + bd * 0.5;
    const z0 = -bh * 0.5, z1 = bh * 0.5;
    // Top & bottom
    positions.push(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y0, z1, x1, y1, z1, x0, y1, z1);
    positions.push(x0, y0, z0, x1, y1, z0, x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0);
    // 4 sides
    positions.push(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z0, x1, y0, z1, x0, y0, z1);
    positions.push(x1, y1, z0, x0, y1, z0, x0, y1, z1, x1, y1, z0, x0, y1, z1, x1, y1, z1);
    positions.push(x0, y1, z0, x0, y0, z0, x0, y0, z1, x0, y1, z0, x0, y0, z1, x0, y1, z1);
    positions.push(x1, y0, z0, x1, y1, z0, x1, y1, z1, x1, y0, z0, x1, y1, z1, x1, y0, z1);
  };

  for (let ci = 0; ci < txt.length; ci++) {
    const glyph = FONT_5X7[txt[ci]] ?? FONT_5X7[" "];
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        if (glyph[r][c] === "1") {
          const gx = (ci * 6 + c + 0.5) * cellW - w * 0.5;
          const gy = (6 - r + 0.5) * cellD - d * 0.5;
          pushBox(gx, gy, cellW * 1.02, cellD * 1.02, h);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions.length ? positions : [0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Parse a Binary or ASCII .STL ArrayBuffer into a flat triangle position array + dimensions (mm).
 */
export function parseStlToPositions(buf: ArrayBuffer): { positions: number[]; widthMm: number; depthMm: number; heightMm: number } {
  const dv = new DataView(buf);
  const positions: number[] = [];
  let isBinary = false;
  if (buf.byteLength >= 84) {
    const triCount = dv.getUint32(80, true);
    if (84 + triCount * 50 === buf.byteLength && triCount > 0) {
      isBinary = true;
      const maxTris = Math.min(triCount, 20000);
      for (let i = 0; i < maxTris; i++) {
        const off = 84 + i * 50 + 12;
        for (let v = 0; v < 3; v++) {
          positions.push(
            dv.getFloat32(off + v * 12, true),
            dv.getFloat32(off + v * 12 + 4, true),
            dv.getFloat32(off + v * 12 + 8, true)
          );
        }
      }
    }
  }
  if (!isBinary) {
    const txt = new TextDecoder().decode(buf);
    const re = /vertex\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(txt)) !== null && positions.length < 180000) {
      positions.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
    }
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return {
    positions,
    widthMm: Number.isFinite(maxX - minX) ? Math.max(2, Number((maxX - minX).toFixed(1))) : 50,
    depthMm: Number.isFinite(maxY - minY) ? Math.max(2, Number((maxY - minY).toFixed(1))) : 50,
    heightMm: Number.isFinite(maxZ - minZ) ? Math.max(2, Number((maxZ - minZ).toFixed(1))) : 15,
  };
}
