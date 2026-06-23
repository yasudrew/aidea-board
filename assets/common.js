// 共通ユーティリティ + ボード描画クラス
window.IB = (function () {
  const cfg = window.APP_CONFIG;
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  // 意味を持たない見た目用パステル(付箋色)
  const PAPER = ["#FAEEDA", "#E6F1FB", "#E1F5EE", "#FBEAF0", "#EAF3DE", "#EEEDFE"];

  const NOTE_W = 210, NOTE_H = 104;

  const q = (k) => new URLSearchParams(location.search).get(k);

  const esc = (s) => {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : s;
    return d.innerHTML;
  };

  // 投稿IDから安定して色を決める(同じ付箋は常に同じ色)
  function colorFor(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return PAPER[h % PAPER.length];
  }

  // ボード描画。draggable=true で管理者(ドラッグ移動可)。
  class Board {
    constructor(el, opts = {}) {
      this.el = el;
      this.draggable = !!opts.draggable;
      this.onMove = opts.onMove || null;   // (id, x, y) 正規化座標
      this.onHide = opts.onHide || null;   // (id)
      this.onChange = opts.onChange || null; // (count)
      this.notes = new Map(); // id -> { post, el }
      window.addEventListener("resize", () => this.relayout());
    }

    toPx(post) {
      const w = this.el.clientWidth, h = this.el.clientHeight;
      let x = post.x * w, y = post.y * h;
      x = Math.max(0, Math.min(x, w - NOTE_W));
      y = Math.max(0, Math.min(y, h - NOTE_H));
      return { x, y };
    }

    setAll(posts) {
      this.el.querySelectorAll(".note").forEach((n) => n.remove());
      this.notes.clear();
      posts.forEach((p) => this.upsert(p, false));
      this.changed();
    }

    upsert(post, animate = true) {
      if (post.hidden) { this.remove(post.id); return; }
      let n = this.notes.get(post.id);
      const { x, y } = this.toPx(post);
      if (!n) {
        const el = document.createElement("div");
        el.className = "note" + (animate ? "" : " noanim");
        el.style.background = colorFor(post.id);
        el.style.left = x + "px";
        el.style.top = y + "px";
        const body = document.createElement("div");
        body.className = "nbody";
        body.textContent = post.body;
        el.appendChild(body);
        if (this.onHide) {
          const b = document.createElement("button");
          b.className = "nhide";
          b.textContent = "✕";
          b.setAttribute("aria-label", "非表示にする");
          b.addEventListener("pointerdown", (e) => e.stopPropagation());
          b.addEventListener("click", (e) => { e.stopPropagation(); this.onHide(post.id); });
          el.appendChild(b);
        }
        if (this.draggable) this.attachDrag(el, post.id);
        this.el.appendChild(el);
        n = { post, el };
        this.notes.set(post.id, n);
      } else {
        n.post = post;
        if (!n.el.classList.contains("dragging")) {
          n.el.style.left = x + "px";
          n.el.style.top = y + "px";
        }
        n.el.querySelector(".nbody").textContent = post.body;
      }
      this.changed();
    }

    remove(id) {
      const n = this.notes.get(id);
      if (n) { n.el.remove(); this.notes.delete(id); this.changed(); }
    }

    clear() {
      this.notes.forEach((n) => n.el.remove());
      this.notes.clear();
      this.changed();
    }

    count() { return this.notes.size; }

    changed() { if (this.onChange) this.onChange(this.count()); }

    relayout() {
      this.notes.forEach((n) => {
        if (n.el.classList.contains("dragging")) return;
        const { x, y } = this.toPx(n.post);
        n.el.style.left = x + "px";
        n.el.style.top = y + "px";
      });
    }

    attachDrag(el, id) {
      let ox = 0, oy = 0, drag = false;
      el.addEventListener("pointerdown", (e) => {
        if (e.target.classList.contains("nhide")) return;
        drag = true;
        el.classList.add("dragging");
        el.style.zIndex = ++Board._z;
        const r = el.getBoundingClientRect();
        ox = e.clientX - r.left;
        oy = e.clientY - r.top;
        el.setPointerCapture(e.pointerId);
      });
      el.addEventListener("pointermove", (e) => {
        if (!drag) return;
        const b = this.el.getBoundingClientRect();
        let nx = e.clientX - b.left - ox;
        let ny = e.clientY - b.top - oy;
        nx = Math.max(0, Math.min(nx, this.el.clientWidth - el.offsetWidth));
        ny = Math.max(0, Math.min(ny, this.el.clientHeight - el.offsetHeight));
        el.style.left = nx + "px";
        el.style.top = ny + "px";
      });
      const end = () => {
        if (!drag) return;
        drag = false;
        el.classList.remove("dragging");
        const fx = parseFloat(el.style.left) / this.el.clientWidth;
        const fy = parseFloat(el.style.top) / this.el.clientHeight;
        const n = this.notes.get(id);
        if (n) n.post = Object.assign({}, n.post, { x: fx, y: fy });
        if (this.onMove) this.onMove(id, fx, fy);
      };
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
    }
  }
  Board._z = 1;

  // ランダムな初期座標(正規化 0..1、端に寄りすぎない)
  const randomPos = () => ({
    x: +(Math.random() * 0.82 + 0.02).toFixed(4),
    y: +(Math.random() * 0.78 + 0.02).toFixed(4),
  });

  return { sb, cfg, q, esc, colorFor, Board, PAPER, randomPos };
})();
