import { useEffect, useState } from "react";
import { api } from "./api.js";
import { defaultMakerOptions, normalizeMakerOptionsResponse } from "./makerOptions.js";

export function useMakerOptions() {
  const [makerOptions, setMakerOptions] = useState(defaultMakerOptions);

  useEffect(() => {
    let cancelled = false;
    api.makers()
      .then((data) => {
        if (!cancelled) setMakerOptions(normalizeMakerOptionsResponse(data));
      })
      .catch(() => {
        if (!cancelled) setMakerOptions(defaultMakerOptions);
      });
    return () => { cancelled = true; };
  }, []);

  return makerOptions;
}
