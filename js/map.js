"use strict";

// ===== 1. 地図の初期化 =====
// setView([緯度, 経度], ズーム倍率)
// ※GeoJSONのcoordinatesは[経度,緯度]の順だったのに、Leafletの関数は[緯度,経度]順。
//   ライブラリごとに順序が違う。Leafletは「L=Latitudeが先」と覚える
const map = L.map("map").setView([35.487, 133.825], 14);

// ===== 2. 地図タイル（背景画像）の読み込み =====
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19, // OSMが提供する最大ズーム。超えてもボケるだけなので制限する
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
}).addTo(map);

// ===== 3. 店舗データの読み込みとピン表示 =====
async function loadSpots() {
  const errorBox = document.getElementById("map-error");

  try {
    const response = await fetch("data/spots.geojson");
    if (!response.ok) {
      throw new Error(
        `データの読み込みに失敗しました（HTTP ${response.status}）`,
      );
    }
    const data = await response.json();

    totalShops = data.features.length;
    updateMapProgress();

    // L.geoJSON：GeoJSONを丸ごと「レイヤー」に変換する
    spotLayer = L.geoJSON(data, {
      // 1個の点を「どんなマーカーにするか」を決める
      pointToLayer: (feature, latlng) => {
        return L.marker(latlng, {
          icon: makeIcon(feature.properties.category),
          title: feature.properties.name, // マウスを乗せると出るツールチップ
        });
      },
      // 生成されたマーカー1個ずつに「付随する動作」を取り付ける
      onEachFeature: (feature, layer) => {
        const p = feature.properties;

        // 文字列の代わりに「関数」を渡すと、開くたびに最新のHTMLを作り直してくれる
        layer.bindPopup(() => popupHTML(p, layer.getLatLng()), { maxWidth: 280 });

        // ポップアップが開かれた瞬間にLeafletが呼ぶコールバック。
        // e（イベントオブジェクト）には「開かれたポップアップ自身」が入っている
        layer.on("popupopen", (e) => {
          const popupEl = e.popup.getElement();  // このポップアップ自身のDOM（器）

          // ボタン個別ではなく「ポップアップの器」に処理を取り付ける。
          // onclickは代入なので、何度開いても1個だけ（積み重ならない）
          popupEl.onclick = (ev) => {
            // 「押された場所」がぺったんボタンかどうかは、クリックされた瞬間に判定
            const btn = ev.target.closest(".stamp-btn");
            if (!btn) return;

            toggleStamp(p.id);
            updateStampBtn(btn, p.id);
            updateMapProgress();
          };
        });
      },
    }).addTo(map);

    // ===== 4. 深いリンク対応（map.html?spot=sample01 で直接開く） =====
    // ※fetchの完了後に実行したいので、この位置にあるのが重要
    const spotId = new URLSearchParams(location.search).get("spot");
    if (spotId) {
      const target = spotLayer
        .getLayers()
        .find((layer) => layer.feature.properties.id === spotId);
      if (target) {
        map.setView(target.getLatLng(), 16); // 即座に移動（アニメなし・確実）
        target.openPopup();
      } else {
        console.warn(`spot=${spotId} に一致する店舗がありません`);
      }
    }
    applyFilter(); // データが揃ったので、初期状態の「表示 X / 6 店」を出す
  } catch (error) {
    errorBox.textContent = `マップデータを読み込めませんでした：${error.message}`;
    errorBox.hidden = false;
    console.error(error);
  }
}

// ===== カテゴリからマーカーのアイコンを作る =====
function makeIcon(category) {
  const emoji = CATEGORY_ICONS[category] ?? "📍"; // 未知のカテゴリの保険
  return L.divIcon({
    className: "pin-wrap", // Leaflet既定のクラス名を上書き（白い枠を消すため）
    html: `<div class="pin pin-${category}">${emoji}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16], // アイコンの「どの点」を座標に合わせるか。円形なので中心
    popupAnchor: [0, -16], // ポップアップを出す位置（アイコン中心から上16px）
  });
}

// ===== ポップアップの中身 =====
function popupHTML(p, latlng) {
  const gmap = `https://www.google.com/maps/search/?api=1&query=${latlng.lat},${latlng.lng}`;
  const done = isStamped(p.id); // ← ここでも現在の状態を焼き込む
  return `
    <strong class="popup-name">${p.name}</strong>
    <p class="popup-cat">${CATEGORY_LABELS[p.category] ?? p.category}</p>
    <div>${badgeHTML(p.stampType)}</div>
    <p class="popup-meta">営業時間：${p.hours}<br>定休日：${p.closed}</p>
    ${p.note ? `<p class="popup-note">${p.note}</p>` : ""}
    <button type="button" class="stamp-btn ${done ? "stamped" : ""}" data-id="${p.id}">${done ? "ぺったん済み ✓" : "ぺったん！"}</button>
    <a class="popup-link" href="${gmap}" target="_blank" rel="noopener">Googleマップで開く →</a>
  `;
}

// マップヘッダーのカウンタを更新
function updateMapProgress() {
  const el = document.getElementById("map-progress");
  if (!el || totalShops === 0) return;
  el.textContent = `ぺったん ${stampedCount()} / ${totalShops}`;
}

loadSpots();

// ===== 5. 現在地表示 =====

// ボタンを取っておく（map.jsはdeferで読まれるので、DOMはもう準備済み）
const locateBtn = document.getElementById("locate-btn");

// 現在地マーカーを入れておく箱。null = 「まだ何も無い」の意味
let myLocationLayer = null;

let totalShops = 0; // 店舗の総数。データ読み込み後に判明する

let spotLayer = null; // 店舗ピン全体のグループ。loadSpotsの中で代入する
// 現在の絞り込み条件（list.jsと同じ形にする）
const filterState = { category: "all", stampType: "all", text: "" };

// 「このボタンがクリックされたらshowMyLocationを呼んで」──これもコールバック
locateBtn.addEventListener("click", showMyLocation);

function showMyLocation() {
  // 位置情報非対応ブラウザの保険
  if (!navigator.geolocation) {
    alert("このブラウザは位置情報に対応していません");
    return;
  }

  // 取得中は連打防止＋「動いてる」表示
  locateBtn.disabled = true;
  locateBtn.textContent = "取得中…";

  // 位置取得をお願いする。結果は後から、成功/失敗どちらか1本のコールバックで届く
  navigator.geolocation.getCurrentPosition(onLocationSuccess, onLocationError, {
    enableHighAccuracy: true, // スマホのGPSを優先（精度↑・電池消費と引き換え）
    timeout: 10000, // 10秒たっても取れなければ失敗扱い
  });
}

// 取得【成功】のときだけブラウザが呼ぶコールバック
function onLocationSuccess(position) {
  locateBtn.disabled = false;
  locateBtn.textContent = "📍 現在地";

  // 結果は position.coords の中。緯度経度が「別々の項目」なので順序の罠ナシ
  const lat = position.coords.latitude; // 緯度
  const lng = position.coords.longitude; // 経度
  const accuracy = position.coords.accuracy; // 誤差の目安（メートル）

  // 前回の現在地が残っていたら削除（クリックのたびに重なるのを防ぐ）
  if (myLocationLayer) {
    map.removeLayer(myLocationLayer);
  }

  // 点（ピン）＋精度を表す円 を1グループにまとめて地図に載せる
  myLocationLayer = L.layerGroup([
    L.circleMarker([lat, lng], {
      // radius は「ピクセル」単位
      radius: 8,
      color: "#4361ee",
      fillColor: "#4361ee",
      fillOpacity: 1,
      weight: 3,
    }),
    L.circle([lat, lng], {
      // radius は「メートル」単位（実世界の大きさ）
      radius: accuracy,
      color: "#4361ee",
      fillColor: "#4361ee",
      fillOpacity: 0.1,
      weight: 1,
    }),
  ]).addTo(map);

  map.flyTo([lat, lng], 16); // アニメ付きで現在地へ移動
}

// 取得【失敗】のときだけブラウザが呼ぶコールバック
function onLocationError(error) {
  locateBtn.disabled = false;
  locateBtn.textContent = "📍 現在地";

  const messages = {
    1: "位置情報の利用が許可されていません。ブラウザの設定から許可してください",
    2: "現在地を取得できませんでした",
    3: "時間内に現在地を取得できませんでした",
  };
  alert(messages[error.code] ?? `エラーが発生しました（コード${error.code}）`);
}

// ===== 6. 絞り込み・検索 =====
function setupMapFilters() {
  document.getElementById("category-chips").innerHTML = chipGroupHTML(
    "category",
    CATEGORY_LABELS,
  );
  document.getElementById("stamp-chips").innerHTML = chipGroupHTML(
    "stamp",
    STAMP_LABELS,
  );

  // ★追加：パネルの開閉
  const toggleBtn = document.getElementById("filter-toggle");
  const panel = document.getElementById("filter-panel");
  toggleBtn.addEventListener("click", () => {
    panel.hidden = !panel.hidden; // 開⇔閉を切り替える
    const open = !panel.hidden;
    toggleBtn.textContent = open ? "絞り込み ▴" : "絞り込み ▾";
    toggleBtn.setAttribute("aria-expanded", open);
    map.invalidateSize(); // ★レイアウトが変わったことをLeafletに伝える
  });

  document.querySelectorAll("#category-chips .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      filterState.category = chip.dataset.category;
      setActiveChip("category-chips", chip);
      applyFilter();
    });
  });
  document.querySelectorAll("#stamp-chips .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      filterState.stampType = chip.dataset.stamp;
      setActiveChip("stamp-chips", chip);
      applyFilter();
    });
  });
  const searchBox = document.getElementById("search-box");
  searchBox.addEventListener("input", (event) => {
    filterState.text = event.target.value.trim();
    applyFilter();
  });
}

// 条件に合うピンだけを地図に残す
function applyFilter() {
  if (!spotLayer) return; // データ読み込み前なら何もしない

  let shown = 0;
  spotLayer.getLayers().forEach((layer) => {
    if (matchesFilter(layer.feature.properties, filterState)) {
      map.addLayer(layer); // 条件OK → 地図に【貼る】
      shown++;
    } else {
      map.removeLayer(layer); // 条件NG → 地図から【剥がす】
    }
  });

  const el = document.getElementById("filter-count");
  if (el) el.textContent = `表示 ${shown} / ${totalShops} 店`;
}

setupMapFilters();
