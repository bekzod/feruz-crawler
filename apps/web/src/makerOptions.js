export const defaultMakerOptions = [{ value: "", label: "all makers" }];

export function normalizeMakerOptionsResponse(data) {
  const options = Array.isArray(data?.rows)
    ? data.rows.filter((option) => typeof option?.value === "string" && option.label)
    : [];
  return options.length ? options : defaultMakerOptions;
}
