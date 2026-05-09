export const FIXTURE_COLORS = [
  "#6dd6ff",
  "#9af0c8",
  "#ffcf70",
  "#c8b7ff",
  "#f08aa6",
  "#8bd2ff"
] as const;

export function fixtureColor(index: number): string {
  return FIXTURE_COLORS[index % FIXTURE_COLORS.length];
}

export function defaultDimension(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "See manual";
}
