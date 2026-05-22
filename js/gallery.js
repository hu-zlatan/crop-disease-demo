// Dataset gallery: shows held-out test images with their true labels, runs the
// model on each, and auto-refreshes every 15 s (or on manual refresh).

const SHOWN = 6;
const REFRESH_MS = 15000;

export class Gallery {
  constructor(grid, progressEl) {
    this.grid = grid;
    this.progressEl = progressEl;
    this.items = [];
    this.classifier = null;
    this.timer = null;
    this.raf = null;
    this.running = false;
    this.token = 0;
  }

  async load() {
    this.items = await (await fetch("gallery.json")).json();
  }

  setClassifier(c) {
    this.classifier = c;
  }

  start() {
    this.running = true;
    this.render();
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    cancelAnimationFrame(this.raf);
  }

  refreshNow() {
    if (this.running) this.render();
  }

  pickRandom() {
    const pool = this.items.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, SHOWN);
  }

  render() {
    const myToken = ++this.token;
    const chosen = this.pickRandom();
    this.grid.innerHTML = "";
    const cards = chosen.map((item) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML =
        '<div class="card-img"><img alt="" loading="lazy"></div>' +
        '<div class="card-label"><b></b><small></small></div>' +
        '<div class="card-pred">Identifying… 识别中</div>';
      card.querySelector(".card-label b").textContent = item.label_en;
      card.querySelector(".card-label small").textContent = item.label_zh;
      card.querySelector("img").src = item.file;
      this.grid.appendChild(card);
      return { card, item };
    });

    this.classifyCards(cards, myToken);
    this.scheduleNext();
  }

  async classifyCards(cards, myToken) {
    if (!this.classifier) return;
    for (const { card, item } of cards) {
      if (myToken !== this.token) return; // a newer batch superseded this one
      const img = card.querySelector("img");
      try {
        await imageReady(img);
        const res = await this.classifier.classify(img, 1);
        const pred = res.top[0];
        const ok = pred.id === item.class_id;
        const el = card.querySelector(".card-pred");
        el.classList.add(ok ? "ok" : "bad");
        el.textContent = ok
          ? "✓ Correct 正确 (" + (pred.prob * 100).toFixed(0) + "%)"
          : "✗ Model 预测: " + pred.cls.label_en;
      } catch (e) {
        const el = card.querySelector(".card-pred");
        el.textContent = "";
      }
    }
  }

  scheduleNext() {
    clearTimeout(this.timer);
    cancelAnimationFrame(this.raf);
    this.timer = setTimeout(() => {
      if (this.running) this.render();
    }, REFRESH_MS);

    const t0 = performance.now();
    const tick = () => {
      const frac = Math.min(1, (performance.now() - t0) / REFRESH_MS);
      this.progressEl.style.width = (frac * 100).toFixed(1) + "%";
      if (frac < 1 && this.running) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
}

function imageReady(img) {
  return new Promise((resolve, reject) => {
    if (img.complete && img.naturalWidth > 0) return resolve();
    img.addEventListener("load", () => resolve(), { once: true });
    img.addEventListener("error", () => reject(new Error("img load failed")), { once: true });
  });
}
