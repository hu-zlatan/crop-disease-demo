// Entry point: wires tabs, loads the model, drives camera + gallery.

import { Classifier } from "./inference.js";
import { Gallery } from "./gallery.js";
import { startCamera, stopCamera, captureFrame, cameraErrorMessage } from "./camera.js";

const $ = (id) => document.getElementById(id);
const classifier = new Classifier();
let gallery = null;
let busy = false;
let zoom = 1.5;

boot();

async function boot() {
  document.querySelectorAll(".tabbar button").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  const STAGE_LABELS = {
    download: "Downloading model 下载模型",
    engine: "Loading inference engine 加载推理引擎",
  };
  try {
    await classifier.init((stage, p) => {
      const isDl = stage === "download" && p < 1;
      $("loading-text").textContent =
        STAGE_LABELS[stage] + (isDl ? " " + (p * 100).toFixed(0) + "%" : "…");
      $("progress-bar").style.width =
        ((stage === "download" ? p : 1) * 100).toFixed(0) + "%";
    });
  } catch (e) {
    $("loading-text").textContent = "Load failed 加载失败: " + (e && e.message ? e.message : e);
    return;
  }

  gallery = new Gallery($("gallery-grid"), $("refresh-progress"));
  await gallery.load();
  gallery.setClassifier(classifier);
  $("btn-refresh").addEventListener("click", () => gallery.refreshNow());

  startSampleRotation();
  wireCamera();
  registerServiceWorker();
  $("loading").classList.add("hidden");
}

function switchTab(tab) {
  document.querySelectorAll(".tabbar button").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === tab)
  );
  document.querySelectorAll(".tab-panel").forEach((p) =>
    p.classList.toggle("active", p.id === "tab-" + tab)
  );
  if (tab === "gallery") {
    gallery.start();
  } else {
    gallery.stop();
  }
  if (tab !== "camera") {
    stopCamera();
    stopPreview();
    showCamState("cam-start");
  }
}

/* ---------------- camera tab ---------------- */

function showCamState(id) {
  ["cam-start", "cam-live", "cam-result", "cam-error"].forEach((s) =>
    $(s).classList.toggle("hidden", s !== id)
  );
}

function wireCamera() {
  $("btn-start-cam").addEventListener("click", openCamera);
  $("btn-retry-cam").addEventListener("click", openCamera);
  const retake = () => {
    showCamState("cam-live");
    startPreview();
  };
  $("btn-retake").addEventListener("click", retake);
  const shot = $("btn-shot");
  if (shot) shot.addEventListener("click", retake);
  $("btn-capture").addEventListener("click", capture);
  $("zoom").addEventListener("input", (e) => applyZoom(parseFloat(e.target.value)));
  wirePinch();
}

// Digital zoom level; the preview draw loop and captureFrame() both read it.
function applyZoom(z) {
  zoom = Math.min(4, Math.max(1, z || 1));
  $("zoom").value = zoom;
  $("zoom-val").textContent = zoom.toFixed(1) + "×";
}

// The live preview is drawn to a <canvas> as a centre crop of the video frame
// (digital zoom). Painting the pixels ourselves avoids unreliable CSS
// transforms on <video> elements, notably on iOS Safari.
let previewRaf = null;
function startPreview() {
  stopPreview();
  const video = $("video");
  const canvas = $("preview");
  const ctx = canvas.getContext("2d");
  const draw = () => {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw && vh) {
      const base = Math.min(vw, vh);
      if (canvas.width !== base) {
        canvas.width = base;
        canvas.height = base;
      }
      const s = base / Math.max(1, zoom);
      ctx.drawImage(video, (vw - s) / 2, (vh - s) / 2, s, s, 0, 0, base, base);
    }
    previewRaf = requestAnimationFrame(draw);
  };
  draw();
}
function stopPreview() {
  if (previewRaf) cancelAnimationFrame(previewRaf);
  previewRaf = null;
}

function wirePinch() {
  const wrap = document.querySelector(".video-wrap");
  if (!wrap) return;
  const dist = (t) =>
    Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  let startDist = 0;
  let startZoom = 1;
  wrap.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 2) {
        startDist = dist(e.touches);
        startZoom = zoom;
      }
    },
    { passive: true }
  );
  wrap.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length === 2 && startDist > 0) {
        e.preventDefault();
        applyZoom(startZoom * (dist(e.touches) / startDist));
      }
    },
    { passive: false }
  );
  wrap.addEventListener("touchend", () => { startDist = 0; }, { passive: true });
}

// Rotates a dataset sample (with its true label) on the start screen.
function startSampleRotation() {
  const imgEl = $("sample-shot");
  const enEl = $("sample-label-en");
  const zhEl = $("sample-label-zh");
  if (!imgEl || !enEl || !zhEl) return;
  const items = gallery.items;
  if (!items || !items.length) return;
  const pick = () => {
    const it = items[(Math.random() * items.length) | 0];
    imgEl.src = it.file;
    enEl.textContent = it.label_en;
    zhEl.textContent = it.label_zh;
  };
  pick();
  setInterval(pick, 15000);
}

async function openCamera() {
  try {
    await startCamera($("video"));
    showCamState("cam-live");
    applyZoom(zoom);
    startPreview();
  } catch (e) {
    $("cam-error-msg").textContent = cameraErrorMessage(e);
    showCamState("cam-error");
  }
}

async function capture() {
  if (busy) return;
  busy = true;
  try {
    const frame = captureFrame($("video"), zoom);
    stopPreview();
    $("shot").src = frame.toDataURL("image/jpeg", 0.9);
    showCamState("cam-result");
    renderResult(null);
    const res = await classifier.classify(frame, 3);
    renderResult(res);
  } catch (e) {
    $("result-list").innerHTML =
      '<p class="loading-inline">Inference failed 识别失败: ' +
      esc(e && e.message ? e.message : String(e)) + "</p>";
  } finally {
    busy = false;
  }
}

function renderResult(res) {
  const list = $("result-list");
  if (!res) {
    list.innerHTML = '<p class="loading-inline">Identifying… 识别中</p>';
    $("infer-time").textContent = "";
    return;
  }
  if (res.ood) {
    const g = res.top[0];
    const gpct = (g.prob * 100).toFixed(1);
    list.innerHTML =
      '<div class="ood-warning">' +
      '<div class="ood-icon">🌱</div>' +
      '<p class="ood-title">No recognizable plant leaf</p>' +
      '<p class="ood-title-zh">未检测到可识别的植物叶片</p>' +
      '<div class="ood-guess">' +
      '<div class="ood-guess-tag">Most likely · 最可能（low confidence 置信度不足）</div>' +
      '<div class="ood-guess-row">' +
      '<span class="ood-guess-name">' + esc(g.cls.label_en) + "</span>" +
      '<span class="ood-guess-pct">' + gpct + "%</span>" +
      "</div>" +
      '<div class="ood-guess-zh">' + esc(g.cls.label_zh) + "</div>" +
      "</div>" +
      '<p class="ood-sub">Tip: zoom in so the leaf fills the dashed box, then retake.</p>' +
      '<p class="ood-sub">提示：放大图片，让叶片填满虚线取景框后重拍。</p>' +
      "</div>";
    $("infer-time").textContent = "⚡ On-device 本地推理 " + res.ms.toFixed(0) + " ms";
    return;
  }
  list.innerHTML = res.top
    .map((r, i) => {
      const pct = (r.prob * 100).toFixed(1);
      const tier =
        r.prob >= 0.7 ? "tier-hi" : r.prob >= 0.4 ? "tier-mid" : "tier-lo";
      return (
        '<div class="result-row ' + (i === 0 ? "top " : "") + tier + '">' +
        '<div class="result-name">' + esc(r.cls.label_en) +
        '<span class="sub">' + esc(r.cls.label_zh) + "</span></div>" +
        '<div class="result-bar"><div class="result-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="result-pct">' + pct + "%</div>" +
        "</div>"
      );
    })
    .join("");
  $("infer-time").textContent = "⚡ On-device 本地推理 " + res.ms.toFixed(0) + " ms";
}

function esc(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const isLocal = ["localhost", "127.0.0.1", ""].includes(location.hostname);
  if (isLocal) {
    // Dev: never let a cached SW serve stale files during local testing.
    navigator.serviceWorker
      .getRegistrations()
      .then((rs) => rs.forEach((r) => r.unregister()));
    return;
  }
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
