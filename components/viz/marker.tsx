import { isDashed, isOutlined, type Status } from "@/lib/viz/status";

/**
 * The value marker every axis primitive draws (TRI-147). Quality is carried by
 * SHAPE: exact = filled bar, est./approx = outlined bar, computed = dashed
 * outline. Colour says only whether the metric is judged (harbour) or
 * informational (ink) — never good/bad.
 */
export function Marker({ x, status, color, height = 12, width = 4, y = 1 }: { x: string; status: Status; color: string; height?: number; width?: number; y?: number }) {
  const outlined = isOutlined(status) || isDashed(status);
  return (
    <rect
      data-mark={outlined ? "outlined" : "filled"}
      x={x}
      y={y}
      width={width}
      height={height}
      rx={1}
      transform={`translate(${-width / 2} 0)`}
      fill={outlined ? "none" : color}
      stroke={color}
      strokeWidth={outlined ? 1.5 : 0}
      strokeDasharray={isDashed(status) ? "2 2" : undefined}
    />
  );
}
