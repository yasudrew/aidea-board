// 部屋作成ロジック
(function () {
  const { sb } = IB;
  const $title = document.getElementById("title");
  const $make = document.getElementById("make");
  const $err = document.getElementById("err");
  const $form = document.getElementById("form");
  const $result = document.getElementById("result");
  const $plink = document.getElementById("plink");
  const $alink = document.getElementById("alink");

  function baseUrl() {
    return location.href.replace(/index\.html.*$/, "").replace(/\/?$/, "/");
  }

  function showError(msg) {
    $err.textContent = msg;
    $err.classList.remove("hidden");
  }

  $make.addEventListener("click", async () => {
    $err.classList.add("hidden");
    $make.disabled = true;
    $make.textContent = "作成中…";
    try {
      const { data, error } = await sb.rpc("create_room", { p_title: $title.value.trim() });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("部屋の作成に失敗しました");

      const pUrl = baseUrl() + "post.html?room=" + encodeURIComponent(row.room_id);
      const aUrl = baseUrl() + "board.html?room=" + encodeURIComponent(row.room_id) +
        "&key=" + encodeURIComponent(row.admin_token);
      $plink.value = pUrl;
      $alink.value = aUrl;

      const qrbox = document.getElementById("qrbox");
      qrbox.innerHTML = "";
      if (typeof QRCode !== "undefined") {
        const holder = document.createElement("div");
        qrbox.appendChild(holder);
        new QRCode(holder, { text: pUrl, width: 128, height: 128 });
      }

      document.getElementById("openboard").onclick = () => { location.href = aUrl; };
      $form.classList.add("hidden");
      $result.classList.remove("hidden");
    } catch (e) {
      console.error(e);
      showError("部屋を作成できませんでした。config.js の設定を確認してください。");
    } finally {
      $make.disabled = false;
      $make.textContent = "部屋を作る";
    }
  });

  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const input = document.getElementById(btn.dataset.copy);
      try {
        await navigator.clipboard.writeText(input.value);
        const t = btn.textContent;
        btn.textContent = "コピー済";
        setTimeout(() => (btn.textContent = t), 1200);
      } catch {
        input.select();
        document.execCommand("copy");
      }
    });
  });

  document.getElementById("again").addEventListener("click", () => location.reload());
})();
