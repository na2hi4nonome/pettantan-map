"use strict";

// ===== ぺったん済の記録管理（両ページ共通） =====
// localStorageに保存できるのは「文字列だけ」。
// 配列をそのまま保存できないので、JSON文字列に変換して保存する。

const STAMP_KEY = "pettan-stamps";

// ぺったん済の店舗id一覧を取り出す（例：["sample01", "sample05"]）
function getStampedIds() {
  try {
    const raw = localStorage.getItem(STAMP_KEY);
    return raw ? JSON.parse(raw) : [];  // 保存がまだ無ければ空配列
  } catch (error) {
    console.error("保存データが壊れていたので0個扱いにします", error);
    return [];  // 壊れていてもサイトが止まらない保険
  }
}
function resetStamps() {
  localStorage.removeItem(STAMP_KEY);
}
function saveStampedIds(ids) {
  localStorage.setItem(STAMP_KEY, JSON.stringify(ids));
}

function isStamped(id) {
  return getStampedIds().includes(id);
}

// 押す⇔消すを切り替える。戻り値は切り替え後の状態（true＝ぺったん済）
function toggleStamp(id) {
  const ids = getStampedIds();
  const index = ids.indexOf(id);
  if (index >= 0) {
    ids.splice(index, 1);  // すでに済み → 取り消す
  } else {
    ids.push(id);          // 未取得 → 追加する
  }
  saveStampedIds(ids);
  return index < 0;
}

function stampedCount() {
  return getStampedIds().length;
}

function updateStampBtn(btn, id) {
  const done = isStamped(id);
  const wasStamped = btn.classList.contains("stamped");  // ★変化前の状態を記録

  btn.classList.toggle("stamped", done);
  btn.textContent = done ? "ぺったん済み ✓" : "ぺったん！";

  // ★「未取得 → 済み」の瞬間だけ、演出用クラスを足す
  if (done && !wasStamped) {
    btn.classList.add("just-stamped");
  }
  // ★取り消したら演出クラスを外す（次のぺったんで再演出できるように）
  if (!done) {
    btn.classList.remove("just-stamped");
  }
}


