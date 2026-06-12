export const defaultMakerOptions = [{ value: "", label: "all makers" }];

function makerLabel(value) {
  if (!value) return "all makers";
  return value
    .split("-")
    .map((word) => word.length <= 3 ? word.toUpperCase() : `${word[0].toUpperCase()}${word.slice(1)}`)
    .join("-");
}

function normalizeMakerOption(option) {
  const value = option.value.trim();
  return {
    ...option,
    value,
    label: makerLabel(value),
  };
}

export function normalizeMakerOptionsResponse(data) {
  const options = Array.isArray(data?.rows)
    ? data.rows
      .filter((option) => typeof option?.value === "string" && option.label)
      .map(normalizeMakerOption)
    : [];
  return options.length ? options : defaultMakerOptions;
}
