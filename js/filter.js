"use strict";

// ===== 絞り込み判定とチップ生成（両ページ共通） =====

// 「この店舗は現在の条件に合うか？」を判定する。
// 両ページがこの関数を使うので、判定基準はサイト内でただ1つ
function matchesFilter(p, filter) {
  // ① 店名検索（textが空文字なら判定をスキップ＝全員合格）
  if (filter.text !== "") {
    const name = p.name.toLowerCase();
    const word = filter.text.toLowerCase();
    if (!name.includes(word)) return false;
  }
  // ② カテゴリ（"all"のときはスキップ）
  if (filter.category !== "all" && p.category !== filter.category) return false;
  // ③ スタンプ条件（stampTypeは「配列」なので配列のincludesを使う）
  if (filter.stampType !== "all" && !p.stampType.includes(filter.stampType))
    return false;

  return true; // どの条件にも外れなかった＝表示してよい
}

// 辞書から「全部＋各項目」のチップ列を作る。
// 第1引数は data-〇〇 の〇〇の部分。"category"なら data-category="food" のようになる
function chipGroupHTML(dictKey, dict) {
  const allBtn = `<button type="button" class="chip active" data-${dictKey}="all">全部</button>`;
  const chips = Object.entries(dict)
    .map(
      ([value, label]) =>
        `<button type="button" class="chip" data-${dictKey}="${value}">${label}</button>`,
    )
    .join("");
  return allBtn + chips;
}

// 同じグループ内で「押されたチップだけ」にactiveクラスを付ける
function setActiveChip(groupId, activeChip) {
  document.querySelectorAll(`#${groupId} .chip`).forEach((chip) => {
    chip.classList.toggle("active", chip === activeChip);
  });
}

// ===== 適用中フィルタの可視化（両ページ共通） =====

// 現在の条件を「表示用の文字列の配列」に変換する
function filterSummaryItems(filter) {
  const items = [];
  if (filter.category !== "all") {
    items.push(CATEGORY_LABELS[filter.category] ?? filter.category);
  }
  if (filter.stampType !== "all") {
    items.push(STAMP_LABELS[filter.stampType] ?? filter.stampType);
  }
  if (filter.text !== "") {
    items.push(`「${filter.text}」`);
  }
  return items;
}

// 適用中フィルタの行を更新する。条件が0個なら行ごと隠す
function updateFilterSummary(boxId, listId, filter) {
  const box = document.getElementById(boxId);
  const list = document.getElementById(listId);
  if (!box || !list) return;

  const items = filterSummaryItems(filter);
  box.hidden = items.length === 0;

  // 検索語はユーザー入力なのでinnerHTMLではなくtextContentで組み立てる（XSS対策）
  list.textContent = "";
  items.forEach((text) => {
    const tag = document.createElement("span");
    tag.className = "active-filter-tag";
    tag.textContent = text;
    list.appendChild(tag);
  });
}
