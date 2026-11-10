import type { DesignNode } from "./designDocument";

function limited(node: DesignNode, axis: "width" | "height", value: number): number {
  const minimum = axis === "width" ? node.layoutSizing?.minWidth : node.layoutSizing?.minHeight;
  const maximum = axis === "width" ? node.layoutSizing?.maxWidth : node.layoutSizing?.maxHeight;
  return Math.max(0.000001, minimum ?? 0.000001, Math.min(maximum ?? Infinity, value));
}

function textIntrinsicSize(node: DesignNode): { width: number; height: number } {
  const text = node.text ?? "";
  const size = node.typography?.size ?? node.fontSize ?? 16;
  const lineHeight =
    node.typography?.lineHeightUnit === "px"
      ? (node.typography.lineHeight ?? size * 1.2)
      : size * ((node.typography?.lineHeight ?? 120) / 100);
  const letterSpacing =
    node.typography?.letterSpacingUnit === "px"
      ? (node.typography.letterSpacing ?? 0)
      : size * ((node.typography?.letterSpacing ?? 0) / 100);
  const lines = text.split("\n");
  const width = Math.max(
    size,
    ...lines.map((line) =>
      Math.max(size, line.length * size * 0.55 + Math.max(0, line.length - 1) * letterSpacing),
    ),
  );
  const constrainedWidth = node.layoutSizing?.width === "hug" ? width : Math.max(size, node.width);
  const wrappedLines = lines.reduce(
    (count, line) => count + Math.max(1, Math.ceil((line.length * size * 0.55) / constrainedWidth)),
    0,
  );
  return { width, height: Math.max(lineHeight, wrappedLines * lineHeight) };
}

export function reflowDesignLayout(input: readonly DesignNode[]): readonly DesignNode[] {
  const nodes = new Map(input.map((node) => [node.nodeId, node]));
  const patch = (
    node: DesignNode,
    change: Partial<Pick<DesignNode, "x" | "y" | "width" | "height">>,
  ) => {
    if (
      Object.entries(change).every(([field, value]) => node[field as keyof typeof change] === value)
    )
      return node;
    const next = { ...node, ...change };
    nodes.set(node.nodeId, next);
    return next;
  };
  const visit = (id: string, seen: ReadonlySet<string>) => {
    let node = nodes.get(id);
    if (!node || seen.has(id)) return;
    const path = new Set([...seen, id]);
    for (const childId of node.childIds) visit(childId, path);
    node = nodes.get(id)!;
    if (node.kind === "text" && node.layoutSizing) {
      const intrinsic = textIntrinsicSize(node);
      node = patch(node, {
        ...(node.layoutSizing.width === "hug"
          ? { width: limited(node, "width", intrinsic.width) }
          : {}),
        ...(node.layoutSizing.height === "hug"
          ? { height: limited(node, "height", intrinsic.height) }
          : {}),
      });
    }
    const model = node.layoutModel;
    if (!model || model.kind === "absolute") {
      patch(node, {
        width: limited(node, "width", node.width),
        height: limited(node, "height", node.height),
      });
      return;
    }
    const children = node.childIds
      .flatMap((childId) => nodes.get(childId) ?? [])
      .filter((child) => child.visible !== false && child.layoutSizing?.position !== "absolute");
    const row = model.direction === "row" || model.kind === "grid";
    const main = row ? "width" : "height",
      cross = row ? "height" : "width";
    const crossAlign =
      model.counterAxisAlign === "min"
        ? "start"
        : model.counterAxisAlign === "max"
          ? "end"
          : model.counterAxisAlign === "baseline"
            ? "start"
            : (model.counterAxisAlign ?? model.align ?? "start");
    const p = Math.max(0, model.padding ?? 0),
      gap = Math.max(0, model.gap ?? 0),
      crossGap = Math.max(0, model.counterAxisSpacing ?? gap);
    const left = Math.max(0, model.paddingLeft ?? p),
      right = Math.max(0, model.paddingRight ?? p);
    const top = Math.max(0, model.paddingTop ?? p),
      bottom = Math.max(0, model.paddingBottom ?? p);
    const mainStart = row ? left : top,
      mainEnd = row ? right : bottom;
    const crossStart = row ? top : left,
      crossEnd = row ? bottom : right;
    const intrinsicMain =
      children.reduce((sum, child) => sum + child[main], 0) +
      gap * Math.max(0, children.length - 1);
    const intrinsicCross = Math.max(0, ...children.map((child) => child[cross]));
    node = patch(node, {
      [main]: limited(
        node,
        main,
        node.layoutSizing?.[main] === "hug" ? intrinsicMain + mainStart + mainEnd : node[main],
      ),
      [cross]: limited(
        node,
        cross,
        node.layoutSizing?.[cross] === "hug" && !model.wrap && model.kind !== "grid"
          ? intrinsicCross + crossStart + crossEnd
          : node[cross],
      ),
    });
    const mainSpace = Math.max(0.000001, node[main] - mainStart - mainEnd);
    const lines: DesignNode[][] = [[]];
    let occupied = 0;
    for (const child of children) {
      const line = lines.at(-1)!;
      if (
        (model.wrap || model.kind === "grid") &&
        line.length &&
        occupied + gap + child[main] > mainSpace
      ) {
        lines.push([child]);
        occupied = child[main];
      } else {
        occupied += (line.length ? gap : 0) + child[main];
        line.push(child);
      }
    }
    const lineCross = lines.map((line) => Math.max(0, ...line.map((child) => child[cross])));
    const totalCross =
      lineCross.reduce((sum, size) => sum + size, 0) + crossGap * Math.max(0, lines.length - 1);
    if (node.layoutSizing?.[cross] === "hug")
      node = patch(node, { [cross]: limited(node, cross, totalCross + crossStart + crossEnd) });
    let crossCursor = crossStart;
    lines.forEach((line, lineIndex) => {
      let remaining =
        mainSpace -
        gap * Math.max(0, line.length - 1) -
        line
          .filter((child) => child.layoutSizing?.[main] !== "fill")
          .reduce((sum, child) => sum + child[main], 0);
      let flexible = line.filter((child) => child.layoutSizing?.[main] === "fill");
      const sizes = new Map(line.map((child) => [child.nodeId, child[main]]));
      while (flexible.length) {
        const equal = Math.max(0.000001, remaining / flexible.length);
        const frozen = flexible.filter((child) => limited(child, main, equal) !== equal);
        if (!frozen.length) {
          flexible.forEach((child) => sizes.set(child.nodeId, equal));
          break;
        }
        for (const child of frozen) {
          const size = limited(child, main, equal);
          sizes.set(child.nodeId, size);
          remaining -= size;
        }
        flexible = flexible.filter((child) => !frozen.includes(child));
      }
      const total =
        line.reduce((sum, child) => sum + sizes.get(child.nodeId)!, 0) +
        gap * Math.max(0, line.length - 1);
      const spare = Math.max(0, mainSpace - total);
      let cursor =
        mainStart + (model.justify === "center" ? spare / 2 : model.justify === "end" ? spare : 0);
      const between =
        model.justify === "space-between" && line.length > 1
          ? gap + spare / (line.length - 1)
          : gap;
      const crossSpace =
        model.wrap || model.kind === "grid"
          ? lineCross[lineIndex]!
          : Math.max(0.000001, node![cross] - crossStart - crossEnd);
      for (const child of line) {
        const crossSize =
          child.layoutSizing?.[cross] === "fill" || crossAlign === "stretch"
            ? limited(child, cross, crossSpace)
            : child[cross];
        const offset = Math.max(
          0,
          crossAlign === "center"
            ? (crossSpace - crossSize) / 2
            : crossAlign === "end"
              ? crossSpace - crossSize
              : 0,
        );
        patch(child, {
          [main]: sizes.get(child.nodeId)!,
          [cross]: crossSize,
          x: row ? cursor : crossCursor + offset,
          y: row ? crossCursor + offset : cursor,
        });
        cursor += sizes.get(child.nodeId)! + between;
      }
      crossCursor += crossSpace + crossGap;
    });
  };
  // Bottom-up passes propagate nested hug sizes and the wrapping caused by parent fill sizing.
  for (let pass = 0; pass <= input.length; pass += 1) {
    const before = [...nodes.values()];
    for (const node of input)
      if (node.parentId === null || !nodes.has(node.parentId)) visit(node.nodeId, new Set());
    if (before.every((node) => nodes.get(node.nodeId) === node)) break;
  }
  return input.every((node) => nodes.get(node.nodeId) === node)
    ? input
    : input.map((node) => nodes.get(node.nodeId)!);
}
