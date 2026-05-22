// Entry point: wires tabs, loads the model, drives camera + gallery.

import { Classifier } from "./inference.js";
import { Gallery } from "./gallery.js";
import { startCamera, stopCamera, captureFrame, cameraErrorMessage } from "./camera.js";

const $ = (id) => document.getElementById(id);
const classifier = new Classifier();
let gallery = null;
let busy = false;

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
  $("btn-retake").addEventListener("click", () => showCamState("cam-live"));
  $("btn-capture").addEventListener("click", capture);
}

async function openCamera() {
  try {
    await startCamera($("video"));
    showCamState("cam-live");
  } catch (e) {
    $("cam-error-msg").textContent = cameraErrorMessage(e);
    showCamState("cam-error");
  }
}

async function capture() {
  if (busy) return;
  busy = true;
  try {
    const frame = captureFrame($("video"));
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
    list.innerHTML =
      '<div class="ood-warning">' +
      '<div class="ood-icon">🌱</div>' +
      '<p class="ood-title">No recognizable plant leaf</p>' +
      '<p class="ood-title-zh">未检测到可识别的植物叶片</p>' +
      '<p class="ood-sub">This model recognizes only 38 plant-leaf classes. ' +
      "Aim at a single leaf with a clean background, then retake.</p>" +
      '<p class="ood-sub">本模型仅识别 38 类植物叶片。请对准单片叶子、背景干净后重拍。</p>' +
      "</div>";
    $("infer-time").textContent = "⚡ On-device 本地推理 " + res.ms.toFixed(0) + " ms";
    return;
  }
  list.innerHTML = res.top
    .map((r, i) => {
      const pct = (r.prob * 100).toFixed(1);
      return (
        '<div class="result-row' + (i === 0 ? " top" : "") + '">' +
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
