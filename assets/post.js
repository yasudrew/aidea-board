// 参加者ロジック（入力 + ボード閲覧タブ）
(function () {
  const { sb, q } = IB;
  const room = q("room");

  const $prompt = document.getElementById("prompt");
  const $body = document.getElementById("body");
  const $counter = document.getElementById("counter");
  const $submit = document.getElementById("submit");
  const $flash = document.getElementById("flash");
  const $closed = document.getElementById("closed");
  const $empty = document.getElementById("empty");

  if (!room) {
    $prompt.textContent = "部屋が指定されていません";
    $submit.disabled = true;
    return;
  }

  let isOpen = true;

  // ---- タブ切替 ----
  const tabs = {
    input: { tab: document.getElementById("tab-input"), pane: document.getElementById("pane-input") },
    board: { tab: document.getElementById("tab-board"), pane: document.getElementById("pane-board") },
  };
  function selectTab(key) {
    Object.entries(tabs).forEach(([k, v]) => {
      const on = k === key;
      v.tab.setAttribute("aria-selected", on ? "true" : "false");
      v.pane.classList.toggle("hidden", !on);
    });
    if (key === "board") board.relayout();
  }
  tabs.input.tab.addEventListener("click", () => selectTab("input"));
  tabs.board.tab.addEventListener("click", () => selectTab("board"));

  // ---- ボード（閲覧専用） ----
  const board = new IB.Board(document.getElementById("stage"), {
    draggable: false,
    onChange: (n) => { $empty.style.display = n ? "none" : "flex"; },
  });

  // ---- 入力 ----
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
      flash("送信できませんでした。部屋が閉じられているか、通信環境をご確認ください。", false);
    } finally {
      $submit.textContent = "送信する";
      refresh();
    }
  });

  function setClosed() {
    isOpen = false;
    $closed.classList.remove("hidden");
    refresh();
  }

  // ---- 初期化 ----
  async function init() {
    // お題と開閉状態
    const { data: rinfo } = await sb.from("rooms_public").select("title,is_open").eq("id", room).single();
    if (rinfo) {
      $prompt.textContent = rinfo.title || "（テーマ未設定）";
      if (!rinfo.is_open) setClosed();
    } else {
      $prompt.textContent = "（テーマ未設定）";
    }

    // 既存投稿
    const { data: posts } = await sb.from("posts")
      .select("*").eq("room_id", room).eq("hidden", false)
      .order("created_at", { ascending: true });
    if (posts) board.setAll(posts);

    // Realtime（投稿の追加・移動・非表示）
    sb.channel("posts-" + room)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "posts", filter: "room_id=eq." + room },
        (payload) => {
          if (payload.eventType === "DELETE") board.remove(payload.old.id);
          else board.upsert(payload.new);
        })
      .subscribe();

    // 部屋を閉じた通知（管理者からの broadcast）
    sb.channel("room:" + room)
      .on("broadcast", { event: "closed" }, () => setClosed())
      .subscribe();

    refresh();
  }
  init();
})();
