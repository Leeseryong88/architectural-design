declare module "polygon-clipping" {
  export type Pair = [number, number];
  export type Ring = Pair[];
  export type Polygon = Ring[];
  export type MultiPolygon = Polygon[];
  export type Geom = Polygon | MultiPolygon;

  export function union(geom: Geom, ...moreGeoms: Geom[]): MultiPolygon;
  export function difference(subjectGeom: Geom, ...clipGeoms: Geom[]): MultiPolygon;
  export function intersection(geom: Geom, ...moreGeoms: Geom[]): MultiPolygon;
  export function xor(geom: Geom, ...moreGeoms: Geom[]): MultiPolygon;
}
