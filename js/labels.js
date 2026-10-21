"use strict";

// ===== 表示用ラベルの変換表（list.jsとmap.jsで共有する「唯一の情報源」） =====
const STAMP_LABELS = {
  eat: "食べてぺったん",
  eat_night: "夜に食べてぺったん",
  visit: "訪れてぺったん",
  stay: "宿泊でぺったん",
  onsen: "入浴でぺったん",
};

const CATEGORY_LABELS = {
  food: "飲食店",
  shop: "物販・商業施設",
  hotel: "宿泊施設",
  onsen: "温泉",
  spot: "観光スポット",
};

// マーカーの絵文字アイコン（map.jsで使用）
const CATEGORY_ICONS = {
  food: "🍜",
  shop: "🛍️",
  hotel: "🛏️",
  onsen: "♨️",
  spot: "📸",
};

// スタンプ条件 → バッジHTML（両ページで使用する共通関数）
function badgeHTML(stampTypes) {
  return stampTypes
    .map(
      (type) =>
        `<span class="badge badge-${type}">${STAMP_LABELS[type] ?? type}</span>`,
    )
    .join("");
}
