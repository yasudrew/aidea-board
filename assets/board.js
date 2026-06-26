// 管理者ボードロジック（ドラッグ移動・非表示・リセット・閉じる・CSV）
(function () {
  const { sb, q } = IB;
  const room = q("room");
  const key = q("key");

  const $title = document.getElementById("title");
  const $count = document.getElementById("count");
  const $empty = document.getElementById("empty");
  const $closed = document.getElementById("closed");

  if (!room || !key) {
    $title.textContent = "リンクが不正です（room / key が必要）";
    return;
  }

  // 参加リンク（key を除いたもの）
  const participantUrl =
    location.href.replace(/board\.html.*$/, "") + "post.html?room=" + encodeURIComponent(room);
  // トップ（部屋作成）画面のURL
  const topUrl = location.href.replace(/board\.html.*$/, "") + "index.html";

  async function rpc(fn, args) {
    const { error } = await sb.rpc(fn, Object.assign({ p_room_id: room, p_token: key }, args));
    if (error) { console.error(fn, error); alert("操作に失敗しました（管理者リンクをご確認ください）"); }
    return !error;
  }

  // ---- ボード（ドラッグ可能） ----
  const board = new IB.Board(document.getElementById("stage"), {
    draggable: true,
    onMove: (id, x, y) => rpc("admin_move_post", { p_post_id: id, p_x: x, p_y: y }),
    onHide: (id) => rpc("admin_hide_post", { p_post_id: id }),
    onChange: (n) => {
      $count.textContent = n + " 件";
      $empty.style.display = n ? "none" : "flex";
    },
  });

  // ---- ツールバー操作 ----
  document.getElementById("reset").addEventListener("click", async () => {
    if (!confirm("この部屋の投稿をすべて削除します。よろしいですか？")) return;
    if (await rpc("admin_reset", {})) board.clear();
  });

  // 部屋を閉じる → モーダルで確認 → 実行したらトップへ戻る
  const $closeModal = document.getElementById("closemodal");
  document.getElementById("close").addEventListener("click", () => {
    $closeModal.classList.remove("hidden");
  });
  document.getElementById("closecancel").addEventListener("click", () => {
    $closeModal.classList.add("hidden");
  });
  document.getElementById("closeconfirm").addEventListener("click", async () => {
    const btn = document.getElementById("closeconfirm");
    btn.disabled = true;
    btn.textContent = "閉じています…";
    if (await rpc("admin_close_room", {})) {
      location.href = topUrl; // トップ（部屋作成）画面へ
    } else {
      btn.disabled = false;
      btn.textContent = "閉じる";
    }
  });

  document.getElementById("csv").addEventListener("click", async () => {
    const { data, error } = await sb.from("posts")
      .select("body,created_at,hidden").eq("room_id", room)
      .order("created_at", { ascending: true });
    if (error) { console.error(error); alert("CSV取得に失敗しました"); return; }
    const escc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["本文", "投稿日時", "非表示"]];
    data.forEach((p) => rows.push([p.body, p.created_at, p.hidden ? "1" : "0"]));
    const csv = "﻿" + rows.map((r) => r.map(escc).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `board_${room}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // ---- 参加リンクモーダル ----
  const $modal = document.getElementById("modal");
  document.getElementById("share").addEventListener("click", () => {
    document.getElementById("modalurl").value = participantUrl;
    const qr = document.getElementById("modalqr");
    qr.innerHTML = "";
    if (typeof QRCode !== "undefined") new QRCode(qr, { text: participantUrl, width: 160, height: 160 });
    $modal.classList.remove("hidden");
  });
  document.getElementById("modalclose").addEventListener("click", () => $modal.classList.add("hidden"));
  document.getElementById("modalcopy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(participantUrl); } catch { document.getElementById("modalurl").select(); document.execCommand("copy"); }
  });

  // ---- 初期化 ----
  async function init() {
    const { data: rinfo } = await sb.from("rooms_public").select("title,is_open").eq("id", room).single();
    if (rinfo) {
      $title.textContent = rinfo.title || "SpeakUp";
      if (!rinfo.is_open) $closed.classList.remove("hidden");
    }

    const { data: posts, error } = await sb.from("posts")
      .select("*").eq("room_id", room).eq("hidden", false)
      .order("created_at", { ascending: true });
    if (error) { $empty.textContent = "DBに接続できません。config.js を確認してください。"; return; }
    if (posts) board.setAll(posts);

    sb.channel("posts-admin-" + room)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "posts", filter: "room_id=eq." + room },
        (payload) => {
          if (payload.eventType === "DELETE") board.remove(payload.old.id);
          else board.upsert(payload.new);
        })
      .subscribe();
  }
  init();
})();
