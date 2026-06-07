import { expect, test } from "bun:test";
import { specMapToCanonical } from "./parseSpecs.js";

const memCache = () => ({ get: async () => null, set: async () => {} });

test("maps a JP spec map to canonical English fields", async () => {
  const specMap = {
    "メーカー": "トヨタ", "年式": "2018年", "走行距離": "5.2万km",
    "ミッション": "CVT", "燃料": "ハイブリッド", "ボディカラー": "パール",
    "支払総額": "150万円", "車両本体価格": "130万円", "修復歴": "なし",
    "所在地": "東京都", "排気量": "1800cc", "乗車定員": "5名"
  };
  const out = await specMapToCanonical(specMap, { cache: memCache(), openai: null });
  expect(out.maker).toBe("toyota");
  expect(out.modelYear).toBe(2018);
  expect(out.mileageKm).toBe(52000);
  expect(out.transmission).toBe("cvt");
  expect(out.fuelType).toBe("hybrid");
  expect(out.color).toBe("pearl white");
  expect(out.totalPrice).toBe(1500000);
  expect(out.vehiclePrice).toBe(1300000);
  expect(out.repairHistory).toBe(false);
  expect(out.prefecture).toBe("tokyo");
  expect(out.displacementCc).toBe(1800);
  expect(out.seats).toBe(5);
});
