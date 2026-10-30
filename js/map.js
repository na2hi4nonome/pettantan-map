"use strict";

// ===== 1. 地図の初期化 =====
// setView([緯度, 経度], ズーム倍率)
// ※GeoJSONのcoordinatesは[経度,緯度]の順だったのに、Leafletの関数は[緯度,経度]順。
//   ライブラリごとに順序が違う。Leafletは「L=Latitudeが先」と覚える
const map = L.map("map").setView([35.45457413, 133.8500623], 14);

// ===== 2. 地図タイル（背景画像）の読み込み =====
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19, // OSMが提供する最大ズーム。超えてもボケるだけなので制限する
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
}).addTo(map);

// ===== 状態変数 =====
// loadSpots()より先に宣言する（呼び出し時点で初期化済みにするため）
let totalShops = 0; // 店舗の総数。データ読み込み後に判明する
let spotLayer = null; // 店舗ピン全体のグループ。loadSpotsの中で代入する
let clusterGroup = null; // ピンをまとめるグループ（クラスタリング用）
// 現在の絞り込み条件（list.jsと同じ形にする）
const filterState = { category: "all", stampType: "all", text: "" };

// ===== 凡例 =====
// 地図の左下に「凡例」を置く。details要素なので、タップで開閉できる
function addLegend() {
  const legend = L.control({ position: "bottomleft" });

  legend.onAdd = () => {
    const wrap = L.DomUtil.create("div", "map-legend-wrap");
    const categoryItems = Object.entries(CATEGORY_LABELS)
      .map(
        ([key, label]) => `
          <li>
            <span class="legend-icon legend-icon-${key}">${CATEGORY_ICONS[key] ?? "📍"}</span>
            ${label}
          </li>`,
      )
      .join("");

    wrap.innerHTML = `
      <details class="map-legend">
        <summary>凡例</summary>
        <ul>
          ${categoryItems}
          <li><span class="legend-cluster">3</span>まとまった店舗</li>
          <li><span class="legend-icon legend-current">●</span>現在地</li>
        </ul>
      </details>`;

    // 凡例のクリックやホイールが地図側に伝わらないようにする
    L.DomEvent.disableClickPropagation(wrap);
    L.DomEvent.disableScrollPropagation(wrap);
    return wrap;
  };

  legend.addTo(map);
}

addLegend();

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
        layer.bindPopup(() => popupHTML(p, layer.getLatLng()), {
          maxWidth: 280,
        });

        // ポップアップが開かれた瞬間にLeafletが呼ぶコールバック。
        // e（イベントオブジェクト）には「開かれたポップアップ自身」が入っている
        layer.on("popupopen", (e) => {
          const popupEl = e.popup.getElement(); // このポップアップ自身のDOM（器）

          // ボタン個別ではなく「ポップアップの器」に処理を取り付ける。
          // onclickは代入なので、何度開いても1個だけ（積み重ならない）
          popupEl.onclick = (ev) => {
            // 「押された場所」がぺったんボタンかどうかは、クリックした瞬間に判定
            const btn = ev.target.closest(".stamp-btn");
            if (!btn) return;

            toggleStamp(p.id);
            updateStampBtn(btn, p.id);
            updateMapProgress();
          };
        });
      },
    });

    // ピンをまとめるグループを作る。
    // プラグインが読み込めなかった場合でも、通常のレイヤーグループで動くようにする
    clusterGroup =
      typeof L.markerClusterGroup === "function"
        ? L.markerClusterGroup({
            maxClusterRadius: 60, // この距離以内のピンを1つにまとめる
            showCoverageOnHover: false, // ホバー時の範囲表示は不要
            spiderfyOnMaxZoom: true, // 最大ズームで重なったピンを扇状に開く
            disableClusteringAtZoom: 18, // 拡大しすぎたらクラスタを解除
            // クラスタのタップ領域も44px以上にする（既定の小サイズは40px）
            iconCreateFunction: (cluster) => {
              const count = cluster.getChildCount();
              const size =
                count < 10 ? "small" : count < 100 ? "medium" : "large";
              const px = size === "small" ? 44 : size === "medium" ? 50 : 60;
              return L.divIcon({
                html: `<div><span>${count}</span></div>`,
                className: `marker-cluster marker-cluster-${size}`,
                iconSize: L.point(px, px),
              });
            },
          })
        : L.layerGroup();

    clusterGroup.addTo(map);

    // spotLayer自体は地図に貼らず、中のマーカーをclusterGroupへ渡す
    spotLayer.getLayers().forEach((layer) => clusterGroup.addLayer(layer));

    applyFilter(); // 全件表示＋「表示 X / Y 店」の初期化

    // ===== 4. 深いリンク対応（map.html?spot=sample01 で直接開く） =====
    // ※fetchの完了後に実行したいので、この位置にあるのが重要
    const spotId = new URLSearchParams(location.search).get("spot");
    if (spotId) {
      const target = spotLayer
        .getLayers()
        .find((layer) => layer.feature.properties.id === spotId);
      if (target) {
        map.setView(target.getLatLng(), 16); // 即座に移動（アニメなし・確実）

        // クラスタ内に隠れている場合、そのピンが見えるまで自動でズームする
        if (typeof clusterGroup.zoomToShowLayer === "function") {
          clusterGroup.zoomToShowLayer(target, () => target.openPopup());
        } else {
          target.openPopup();
        }
      } else {
        console.warn(`spot=${spotId} に一致する店舗がありません`);
      }
    }
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
    iconSize: [44, 44],
    iconAnchor: [22, 22], // アイコンの「どの点」を座標に合わせるか。円形なので中心
    popupAnchor: [0, -22], // ポップアップを出す位置（アイコン中心から上22px）
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

// ===== 5. 現在地表示（追従モード） =====

// ボタンを取っておく（map.jsはdeferで読まれるので、DOMはもう準備済み）
const locateBtn = document.getElementById("locate-btn");

let myPoint = null; // 現在地の点
let myAccuracy = null; // 精度を表す円
let followId = null; // watchPositionのID。null = 追従していない

// ボタンはトグル式：押すと追従開始、もう一度押すと停止
locateBtn.addEventListener("click", () => {
  if (followId === null) {
    startFollow();
  } else {
    stopFollow();
  }
});

function startFollow() {
  if (!navigator.geolocation) {
    alert("このブラウザは位置情報に対応していません");
    return;
  }
  locateBtn.disabled = true;
  locateBtn.textContent = "現在地を探しています…";

  // watchPosition = 監視を登録して、位置が更新されるたびコールバックが呼ばれる。
  // 戻り値のIDが「この監視の番号」。止めるときはclearWatch(ID)に渡す
  followId = navigator.geolocation.watchPosition(
    onLocationUpdate,
    onLocationError,
    {
      enableHighAccuracy: true, // スマホのGPSを優先（精度↑・電池消費と引き換え）
      maximumAge: 5000, // 5秒以内のキャッシュなら再利用してOK
      timeout: 20000, // 1回の取得が20秒超えたら失敗扱い
    },
  );
}

function stopFollow() {
  if (followId !== null) {
    navigator.geolocation.clearWatch(followId); // 監視解除。忘れるとGPSを使い続けて電池を食う
    followId = null;
  }
  locateBtn.disabled = false;
  locateBtn.textContent = "📍 現在地";
  locateBtn.classList.remove("following");
}

// 位置が更新されるたびに呼ばれるコールバック
function onLocationUpdate(position) {
  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
  const accuracy = position.coords.accuracy; // 誤差の目安（メートル）

  if (!myPoint) {
    // 最初の1回だけ、点と円を作って地図に載せる
    myPoint = L.circleMarker([lat, lng], {
      radius: 8,
      color: "#4361ee",
      fillColor: "#4361ee",
      fillOpacity: 1,
      weight: 3,
    }).addTo(map);
    myAccuracy = L.circle([lat, lng], {
      radius: accuracy, // メートル単位（実世界の大きさ）
      color: "#4361ee",
      fillColor: "#4361ee",
      fillOpacity: 0.1,
      weight: 1,
    }).addTo(map);

    map.flyTo([lat, lng], 16); // 初回だけ現在地へ移動。追従ではなく「一度だけ」
  } else {
    // 2回目以降は、既存の点と円を新しい位置へ移すだけ（削除→再作成しない）
    myPoint.setLatLng([lat, lng]);
    myAccuracy.setLatLng([lat, lng]);
    myAccuracy.setRadius(accuracy);
  }

  locateBtn.disabled = false;
  locateBtn.textContent = "📍 現在地表示中";
  locateBtn.classList.add("following");
}

function onLocationError(error) {
  stopFollow(); // 失敗したら追従をやめてボタンを元に戻す

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

  // 適用中フィルタの「解除」ボタン
  const clearBtn = document.getElementById("clear-filters");
  if (clearBtn) clearBtn.addEventListener("click", clearFilters);
}

// すべての絞り込み条件を初期状態へ戻す
function clearFilters() {
  filterState.category = "all";
  filterState.stampType = "all";
  filterState.text = "";

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

  applyFilter();
}

// 条件に合うピンだけを地図に残す
function applyFilter() {
  // パネルを閉じていても適用中条件が見えるように、先に表示を更新する
  updateFilterSummary("active-filters", "active-filter-list", filterState);

  // 適用中フィルタ行の表示/非表示で地図の高さが変わるため再計算する
  map.invalidateSize();

  if (!spotLayer || !clusterGroup) return; // データ読み込み前なら何もしない

  // 条件に合うマーカーだけを配列に集める
  const shownLayers = spotLayer
    .getLayers()
    .filter((layer) =>
      matchesFilter(layer.feature.properties, filterState),
    );

  // クラスタグループを一度空にしてから、条件に合うピンだけを入れ直す
  clusterGroup.clearLayers();
  shownLayers.forEach((layer) => clusterGroup.addLayer(layer));

  const el = document.getElementById("filter-count");
  if (el) el.textContent = `表示 ${shownLayers.length} / ${totalShops} 店`;
}

setupMapFilters();
