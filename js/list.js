"use strict";

// ===== 店舗一覧の生成 =====

// 全店舗データ。fetchで1回だけ読み込み、以降はここを起点に描き直す
let allFeatures = [];
let total = 0;

// 現在の絞り込み条件。この3つが「状態」
const filter = { category: "all", stampType: "all", text: "" };

async function loadShopList() {
  const listElement = document.getElementById("shop-list");

  try {
    const response = await fetch("data/spots.geojson");
    if (!response.ok) {
      throw new Error(
        `データファイルの読み込みに失敗しました（HTTP ${response.status}）`,
      );
    }
    const data = await response.json();

    allFeatures = data.features;
    total = allFeatures.length;

    renderFilterUI(); // 絞り込みUIの準備（1回だけ）
    renderList(); // 一覧の1回目の描画
  } catch (error) {
    listElement.innerHTML = `<p class="error">店舗一覧を読み込めませんでした：${error.message}</p>`;
    console.error(error);
  }
}

// ===== 絞り込みUIの準備 =====
function renderFilterUI() {
  // チップのHTMLを作って流し込む（辞書から自動生成）
  document.getElementById("category-chips").innerHTML = chipGroupHTML(
    "category",
    CATEGORY_LABELS,
  );
  document.getElementById("stamp-chips").innerHTML = chipGroupHTML(
    "stamp",
    STAMP_LABELS,
  );

  // カテゴリチップ：押されたら「状態を変えて、描き直す」
  document.querySelectorAll("#category-chips .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      filter.category = chip.dataset.category;
      setActiveChip("category-chips", chip);
      renderList();
    });
  });

  // スタンプ条件チップ
  document.querySelectorAll("#stamp-chips .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      filter.stampType = chip.dataset.stamp;
      setActiveChip("stamp-chips", chip);
      renderList();
    });
  });

  // 検索box：clickではなく input。1文字打つごとに発火する
  const searchBox = document.getElementById("search-box");
  searchBox.addEventListener("input", (event) => {
    filter.text = event.target.value.trim();
    renderList();
  });

  // 適用中フィルタの「解除」ボタン
  const clearBtn = document.getElementById("clear-filters");
  if (clearBtn) clearBtn.addEventListener("click", clearFilters);
}

// すべての絞り込み条件を初期状態へ戻す
function clearFilters() {
  filter.category = "all";
  filter.stampType = "all";
  filter.text = "";

  const searchBox = document.getElementById("search-box");
  if (searchBox) searchBox.value = "";

  // 各グループの「全部」チップをactiveに戻す
  setActiveChip(
    "category-chips",
    document.querySelector('#category-chips .chip[data-category="all"]'),
  );
  setActiveChip(
    "stamp-chips",
    document.querySelector('#stamp-chips .chip[data-stamp="all"]'),
  );

  renderList();
}

// ===== 一覧を描き直す（条件が変わるたびに呼ばれる） =====
function renderList() {
  const listElement = document.getElementById("shop-list");

  // ★本日の主役：配列のfilter。条件を満たすFeatureだけを残す
  const shown = allFeatures.filter((feature) =>
    matchesFilter(feature.properties, filter),
  );

  const cards = shown.map((feature) => {
    const p = feature.properties;
    const done = isStamped(p.id);
    return `
      <article class="shop-card">
        <h3 class="shop-name">${p.name}</h3>
        <p class="shop-category">${CATEGORY_LABELS[p.category] ?? p.category}</p>
        <div class="shop-badges">${badgeHTML(p.stampType)}</div>
        <p class="shop-meta">営業時間：${p.hours}<br>定休日：${p.closed}</p>
        ${p.note ? `<p class="shop-note">${p.note}</p>` : ""}
        <div class="shop-actions">
          <button type="button" class="stamp-btn ${done ? "stamped" : ""}" data-id="${p.id}">${done ? "ぺったん済み ✓" : "ぺったん！"}</button>
          <a class="btn btn-outline btn-sm" href="map.html?spot=${p.id}">マップで見る →</a>
        </div>
      </article>
    `;
  });

  listElement.innerHTML = `
    <p class="shop-count">該当 ${shown.length} / 全${total}店</p>
    <p id="stamp-count" class="stamp-count"></p>
    <div class="progress"><div class="progress-fill" id="progress-fill"></div></div>
    <div class="list-tools">
      <button type="button" id="reset-stamps" class="btn btn-outline btn-sm">記録を全消去</button>
    </div>
    ${
      cards.length > 0
        ? `<div class="shop-grid">${cards.join("")}</div>`
        : `<div class="no-result">
             <p>条件に合う店舗がありません</p>
             <button type="button" class="btn btn-outline btn-sm clear-empty-btn">絞り込みを解除</button>
           </div>`
    }
  `;

  // ボタンが生まれ変わったので、クリック処理も張り直す（重要！下で解説）
  document.querySelectorAll(".stamp-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      toggleStamp(btn.dataset.id);
      updateStampBtn(btn, btn.dataset.id);
      updateProgressUI(total);
    });
  });

  // 全消去ボタン（renderListで生まれ直すので、ここで毎回張り直す）
  const resetBtn = document.getElementById("reset-stamps");
  resetBtn.addEventListener("click", () => {
    const ok = confirm("全店舗のぺったん記録を消します。よろしいですか？");
    if (!ok) return; // キャンセルされたら何もしない
    resetStamps();
    renderList(); // 状態が変わったので再描画
  });

  // 0件表示の中にある「絞り込みを解除」
  const clearEmptyBtn = document.querySelector(".clear-empty-btn");
  if (clearEmptyBtn) clearEmptyBtn.addEventListener("click", clearFilters);

  // 適用中フィルタの行を更新
  updateFilterSummary("active-filters", "active-filter-list", filter);

  updateProgressUI(total);
}
// 進捗表示（「3 / 6 ぺったん！」＋バー）を更新する
function updateProgressUI(total) {
  const countEl = document.getElementById("stamp-count");
  const fillEl = document.getElementById("progress-fill");
  if (!countEl || !fillEl) return; // 要素が無いページでは何もしない保険

  const count = stampedCount();
  countEl.textContent = `${count} / ${total} ぺったん！`;
  // 店舗0件のときの割り算（0÷0=NaN）を防ぐガード
  const ratio = total > 0 ? count / total : 0;
  fillEl.style.width = `${ratio * 100}%`;
}

loadShopList();
