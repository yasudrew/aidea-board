// 参加者ロジック（入力専用。リアルタイム購読は持たない＝拡散負荷ゼロ）
(function () {
  const { sb, q } = IB;
  const room = q("room");

  const $prompt = document.getElementById("prompt");
  const $body = document.getElementById("body");
  const $counter = document.getElementById("counter");
  const $submit = document.getElementById("submit");
  const $flash = document.getElementById("flash");
  const $closed = document.getElementById("closed");

  if (!room) {
    $prompt.textContent = "部屋が指定されていません";
    $submit.disabled = true;
    return;
  }

  let isOpen = true;

  function refresh() {
    const len = $body.value.trim().length;
    $counter.textContent = `${$body.value.length} / 100`;
    $counter.classList.toggle("over", $body.value.length > 100);
    $submit.disabled = !(isOpen && len >= 1 && len <= 100);
  }
  $body.addEventListener("input", refresh);

  function flash(msg, ok) {
    $flash.textContent = msg;
    $flash.className = "flash " + (ok ? "ok" : "err");
  }

  function setClosed() {
    isOpen = false;
    $closed.classList.remove("hidden");
    refresh();
  }

  $submit.addEventListener("click", async () => {
    const body = $body.value.trim();
    if (!body) return;
    $submit.disabled = true;
    $submit.textContent = "送信中…";
    try {
      const pos = IB.randomPos();
      const { error } = await sb.from("posts").insert({ room_id: room, body, x: pos.x, y: pos.y });
      if (error) throw error;
      flash("送信しました！ありがとうございます 🎉", true);
      $body.value = "";
      refresh();
    } catch (e) {
      console.error(e);
      flash("送信できませんでした。部屋が閉じられている可能性があります。", false);
      setClosed();
    } finally {
      $submit.textContent = "送信する";
      refresh();
    }
  });

  // 初期化: テーマと開閉状態を1回だけ取得（以降はリアルタイム購読しない）
  async function init() {
    const { data: rinfo } = await sb.from("rooms_public").select("title,is_open").eq("id", room).single();
    if (rinfo) {
      $prompt.textContent = rinfo.title || "（テーマ未設定）";
      if (!rinfo.is_open) setClosed();
    } else {
      $prompt.textContent = "（テーマ未設定）";
    }
    refresh();
  }
  init();
})();
