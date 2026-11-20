"use strict";

// ===== 店舗一覧の生成 =====

// 全店舗データ。fetchで1回だけ読み込み、以降はここを起点に描き直す
let allFeatures = [];
let total = 0;

// 現在の絞り込み条件（適用済み）。この3つが「状態」
const filter = { category: "all", stampType: "all", text: "" };
// プルダウンパネルを開いている間の仮選択。
// 「絞り込む」を押すまで一覧には効かない
let tempFilter = { category: "all", stampType: "all" };

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

// ===== 絞り込みUIの準備（プルダウン式） =====

// 辞書から「全部＋各項目」の選択肢ボタンを作る（ラジオ丸付き）
function optionGroupHTML(dictKey, dict) {
  const allBtn = `<button type="button" class="option-btn active" data-${dictKey}="all"><span class="radio" aria-hidden="true"></span>全部</button>`;
  const btns = Object.entries(dict)
    .map(
      ([value, label]) =>
        `<button type="button" class="option-btn" data-${dictKey}="${value}"><span class="radio" aria-hidden="true"></span>${label}</button>`,
    )
    .join("");
  return allBtn + btns;
}

// グループ内で「選択中の値のボタンだけ」にactiveクラスを付ける
function setActiveOption(groupId, value, dictKey) {
  document.querySelectorAll(`#${groupId} .option-btn`).forEach((btn) => {
    btn.classList.toggle("active", btn.dataset[dictKey] === value);
  });
}

function renderFilterUI() {
  // 選択肢のHTMLを作って流し込む（辞書から自動生成）
  document.getElementById("category-options").innerHTML = optionGroupHTML(
    "category",
    CATEGORY_LABELS,
  );
  document.getElementById("stamp-options").innerHTML = optionGroupHTML(
    "stamp",
    STAMP_LABELS,
  );

  // カテゴリの仮選択
  document.querySelectorAll("#category-options .option-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      tempFilter.category = btn.dataset.category;
      setActiveOption("category-options", tempFilter.category, "category");
      updateFilterPreview();
    });
  });

  // スタンプ条件の仮選択
  document.querySelectorAll("#stamp-options .option-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      tempFilter.stampType = btn.dataset.stamp;
      setActiveOption("stamp-options", tempFilter.stampType, "stamp");
      updateFilterPreview();
    });
  });

  // 検索box：clickではなく input。1文字打つごとに発火し、即時反映する
  const searchBox = document.getElementById("search-box");
  searchBox.addEventListener("input", (event) => {
    filter.text = event.target.value.trim();
    renderList();
  });

  // プルダウンの開閉。開くたびに「適用済みの条件」を仮選択へ写す
  const toggle = document.getElementById("filter-toggle");
  const panel = document.getElementById("filter-panel");
  toggle.addEventListener("click", () => {
    const willOpen = panel.hidden;
    if (willOpen) {
      tempFilter = { category: filter.category, stampType: filter.stampType };
      setActiveOption("category-options", tempFilter.category, "category");
      setActiveOption("stamp-options", tempFilter.stampType, "stamp");
      updateFilterPreview();
    }
    panel.hidden = !willOpen;
    toggle.setAttribute("aria-expanded", String(willOpen));
    toggle.classList.toggle("open", willOpen);
  });

  // 「絞り込む」：仮選択を本適用して、パネルを閉じる
  document.getElementById("filter-apply").addEventListener("click", () => {
    filter.category = tempFilter.category;
    filter.stampType = tempFilter.stampType;
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    toggle.classList.remove("open");
    renderList();
  });

  // 「絞り込みを解除」：仮選択だけを全部に戻す（適用は「絞り込む」押下時）
  document.getElementById("filter-clear").addEventListener("click", () => {
    tempFilter = { category: "all", stampType: "all" };
    setActiveOption("category-options", "all", "category");
    setActiveOption("stamp-options", "all", "stamp");
    updateFilterPreview();
  });
}

// 条件オブジェクトで数えたときの該当件数
function countMatches(f) {
  return allFeatures.filter((feature) =>
    matchesFilter(feature.properties, f),
  ).length;
}

// パネル内の件数プレビュー（仮選択＋現在の検索語で数える）
function updateFilterPreview() {
  const el = document.getElementById("filter-preview");
  if (!el) return;
  const n = countMatches({
    category: tempFilter.category,
    stampType: tempFilter.stampType,
    text: filter.text,
  });
  el.textContent = `この条件だと ${n} 店`;
}

// すべての絞り込み条件を初期状態へ戻す（0件表示のボタンなどから呼ばれる）
function clearFilters() {
  filter.category = "all";
  filter.stampType = "all";
  filter.text = "";
  tempFilter = { category: "all", stampType: "all" };

  const searchBox = document.getElementById("search-box");
  if (searchBox) searchBox.value = "";

  setActiveOption("category-options", "all", "category");
  setActiveOption("stamp-options", "all", "stamp");

  renderList();
}

// 絞り込みバーの要約（適用中のカテゴリ／スタンプ条件）と件数を更新する
function updateFilterBar(shownCount) {
  const summary = document.getElementById("filter-summary");
  const count = document.getElementById("filter-count");
  if (summary) {
    // 検索語は検索欄そのものが見えているので、要約には含めない
    const items = filterSummaryItems({ ...filter, text: "" });
    summary.textContent = items.length > 0 ? items.join("・") : "絞り込みなし";
  }
  if (count) count.textContent = `該当 ${shownCount}店`;
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
    // 1店分は details（開閉できる箱）にする。
    // summary（常に表示される細い行）には店名・カテゴリ・バッジだけを置き、
    // 営業時間やボタンは開いたときだけ見せる。スマホでのスクロール量を減らす工夫。
    // 行の右端には「判子マス」を常設し、ぺったん済みなら「済」の判子が収まる
    return `
      <details class="shop-item">
        <summary class="shop-summary">
          <span class="shop-summary-main">
            <span class="shop-name">${p.name}</span>
            <span class="stamp-slot${done ? " is-done" : ""}">${done ? "済" : ""}</span>
          </span>
          <span class="shop-summary-sub">
            <span class="shop-category">${CATEGORY_LABELS[p.category] ?? p.category}</span>
            <span class="shop-badges">${badgeHTML(p.stampType)}</span>
          </span>
        </summary>
        <div class="shop-detail">
          <p class="shop-meta">営業時間：${p.hours}<br>定休日：${p.closed}</p>
          ${p.note ? `<p class="shop-note">${p.note}</p>` : ""}
          <div class="shop-actions">
            <button type="button" class="stamp-btn ${done ? "stamped" : ""}" data-id="${p.id}">${done ? "ぺったん済み ✓" : "ぺったん！"}</button>
            <a class="btn btn-outline btn-sm" href="map.html?spot=${p.id}">マップで見る →</a>
          </div>
        </div>
      </details>
    `;
  });

  listElement.innerHTML = `
    <p class="shop-count">該当 ${shown.length} / 全${total}店</p>
    <div class="stamp-card">
      <p class="stamp-card-title">あなたのぺったん台紙</p>
      <p id="stamp-count" class="stamp-count"></p>
      <div id="stamp-dots" class="stamp-dots" aria-hidden="true"></div>
      <div class="list-tools">
        <button type="button" id="reset-stamps" class="btn btn-outline btn-sm">記録を全消去</button>
      </div>
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
      updateDoneMark(btn);
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

  // 絞り込みバーの要約と件数を更新
  updateFilterBar(shown.length);

  updateProgressUI(total);
}

// ぺったん状態が変わったら、summary側の判子マスも合わせる
// （閉じたままでも済んだ店が分かるようにするための小さな同期処理）
function updateDoneMark(btn) {
  const slot = btn.closest(".shop-item")?.querySelector(".stamp-slot");
  if (!slot) return;

  const done = isStamped(btn.dataset.id);
  slot.classList.toggle("is-done", done);
  slot.textContent = done ? "済" : "";
  if (done) {
    // 押した瞬間だけ判子らしく弾ませる（クラスを付け直して再再生）
    slot.classList.remove("just");
    void slot.offsetWidth;
    slot.classList.add("just");
  }
}

// 台紙カードの表示（「3 / 70 ぺったん！」＋丸マスの埋まり具合）を更新する
function updateProgressUI(total) {
  const countEl = document.getElementById("stamp-count");
  if (!countEl) return; // 要素が無いページでは何もしない保険

  const count = stampedCount();
  countEl.textContent = `${count} / ${total} ぺったん！`;

  // 丸マスは店舗数ぶん用意し、押した数だけラズベリー色に埋める
  const dotsEl = document.getElementById("stamp-dots");
  if (!dotsEl) return;
  if (dotsEl.childElementCount !== total) {
    dotsEl.innerHTML = "";
    for (let i = 0; i < total; i++) {
      const dot = document.createElement("span");
      dot.className = "stamp-dot";
      dotsEl.appendChild(dot);
    }
  }
  [...dotsEl.children].forEach((dot, i) => {
    dot.classList.toggle("filled", i < count);
  });
}

loadShopList();
