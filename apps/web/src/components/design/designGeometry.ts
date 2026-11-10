import type { DesignNode } from "./designDocument";

export type DesignMatrix = readonly [number, number, number, number, number, number];
export const designIdentityMatrix: DesignMatrix = [1, 0, 0, 1, 0, 0];

export function multiplyDesignMatrices(a: DesignMatrix, b: DesignMatrix): DesignMatrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

export function invertDesignMatrix(m: DesignMatrix): DesignMatrix {
  const determinant = m[0] * m[3] - m[1] * m[2];
  return [
    m[3] / determinant,
    -m[1] / determinant,
    -m[2] / determinant,
    m[0] / determinant,
    (m[2] * m[5] - m[3] * m[4]) / determinant,
    (m[1] * m[4] - m[0] * m[5]) / determinant,
  ];
}

export function transformDesignPoint(m: DesignMatrix, point: { x: number; y: number }) {
  return { x: m[0] * point.x + m[2] * point.y + m[4], y: m[1] * point.x + m[3] * point.y + m[5] };
}

export function designNodeMatrix(node: DesignNode): DesignMatrix {
  const radians = ((node.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(radians),
    sin = Math.sin(radians);
  const x = node.flipX ? -1 : 1,
    y = node.flipY ? -1 : 1;
  const a = cos * x,
    b = sin * x,
    c = -sin * y,
    d = cos * y;
  return [
    a,
    b,
    c,
    d,
    node.x + node.width / 2 - (a * node.width + c * node.height) / 2,
    node.y + node.height / 2 - (b * node.width + d * node.height) / 2,
  ];
}

export function designWorldMatrix(nodes: ReadonlyMap<string, DesignNode>, nodeId: string) {
  let matrix = designIdentityMatrix;
  let node = nodes.get(nodeId);
  const visited = new Set<string>();
  while (node && !visited.has(node.nodeId)) {
    visited.add(node.nodeId);
    matrix = multiplyDesignMatrices(designNodeMatrix(node), matrix);
    node = nodes.get(node.parentId ?? "");
  }
  return matrix;
}

export function designMatrixPose(
  matrix: DesignMatrix,
  node: Pick<DesignNode, "width" | "height" | "rotation" | "flipX" | "flipY">,
) {
  const reflected = matrix[0] * matrix[3] - matrix[1] * matrix[2] < 0;
  const sign = reflected ? -1 : 1;
  const precise = (n: number) => Math.round(n * 1e6) / 1e6 || 0;
  const rotation = precise((Math.atan2(matrix[1] * sign, matrix[0] * sign) * 180) / Math.PI);
  const center = transformDesignPoint(matrix, { x: node.width / 2, y: node.height / 2 });
  return {
    x: precise(center.x - node.width / 2),
    y: precise(center.y - node.height / 2),
    ...(node.rotation !== undefined || Math.abs(rotation) > 1e-6 ? { rotation } : {}),
    ...(node.flipX !== undefined || node.flipY !== undefined || reflected
      ? { flipX: reflected, flipY: false }
      : {}),
  };
}

export function designNodeCssTransform(node: DesignNode) {
  return `rotate(${node.rotation ?? 0}deg)${node.flipX || node.flipY ? ` scale(${node.flipX ? -1 : 1}, ${node.flipY ? -1 : 1})` : ""}`;
}
