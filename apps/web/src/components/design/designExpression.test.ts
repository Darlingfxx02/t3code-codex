import { expect, it } from "vite-plus/test";
import { evaluateDesignExpression } from "./designExpression";

it.each([
  ["Mixed+100", 20, 120],
  ["Mixed+100", 80, 180],
  ["x/2+6", 20, 16],
  ["*2", 0.64, 1.28],
  ["/4", 80, 20],
  ["2+3*4", 0, 14],
  ["(2+3)*4", 0, 20],
  ["2^3^2", 0, 512],
  ["-2^2", 0, -4],
  ["(-2)^2", 0, 4],
  ["1e2+.5", 0, 100.5],
  ["24+2", undefined, 26],
  ["Mixed*2", undefined, null],
  ["1/0", 1, null],
  ["Math.random()", 1, null],
  ["", 1, null],
  ["2+", 1, null],
  ["(2+3", 1, null],
  ["1e309", 1, null],
])("evaluates %s at %s as %s without executing code", (expression, current, result) => {
  expect(evaluateDesignExpression(expression, current)).toBe(result);
});
