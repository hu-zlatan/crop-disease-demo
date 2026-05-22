// ONNX Runtime Web session wrapper: loads the model, runs on-device inference.

import { preprocess } from "./preprocess.js";

export class Classifier {
  constructor() {
    this.session = null;
    this.classes = null;
  }

  async init(onProgress) {
    ort.env.wasm.wasmPaths = new URL("vendor/ort/", document.baseURI).href;
    ort.env.wasm.numThreads = 1;

    this.classes = await (await fetch("model/classes.json")).json();
    this.ood = await (await fetch("model/ood.json")).json();

    onProgress && onProgress("download", 0);
    const buf = await fetchWithProgress("model/litecrop_color38.onnx", (p) =>
      onProgress && onProgress("download", p)
    );

    onProgress && onProgress("engine", 1);
    this.session = await ort.InferenceSession.create(buf, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
  }

  // source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
  async classify(source, topk = 3) {
    const input = preprocess(source);
    const t0 = performance.now();
    const out = await this.session.run({ input });
    const ms = performance.now() - t0;

    const logits = out.logits.data;
    const probs = softmax(logits);
    const order = [...probs.keys()].sort((a, b) => probs[b] - probs[a]);
    const top = order.slice(0, topk).map((i) => ({
      id: i,
      prob: probs[i],
      cls: this.classes[i],
    }));

    // Out-of-distribution gate: a closed-set 38-class model has no "none of
    // the above", so reject low-confidence / high-energy inputs (non-leaf
    // photos). Thresholds calibrated by code/scripts/calibrate_ood.py.
    const maxProb = probs[order[0]];
    const energy = -logSumExp(logits);
    const ood = maxProb < this.ood.minProb || energy > this.ood.maxEnergy;
    return { top, ms, maxProb, energy, ood };
  }
}

function logSumExp(arr) {
  let max = -Infinity;
  for (const v of arr) if (v > max) max = v;
  let sum = 0;
  for (const v of arr) sum += Math.exp(v - max);
  return max + Math.log(sum);
}

function softmax(arr) {
  let max = -Infinity;
  for (const v of arr) if (v > max) max = v;
  const exp = new Float64Array(arr.length);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    exp[i] = Math.exp(arr[i] - max);
    sum += exp[i];
  }
  for (let i = 0; i < arr.length; i++) exp[i] /= sum;
  return exp;
}

async function fetchWithProgress(url, onProgress) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("HTTP " + resp.status + " for " + url);
  const total = +resp.headers.get("Content-Length") || 0;
  if (!resp.body || !total) return await resp.arrayBuffer();

  const reader = resp.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(received / total);
  }
  const buf = new Uint8Array(received);
  let pos = 0;
  for (const c of chunks) {
    buf.set(c, pos);
    pos += c.length;
  }
  return buf.buffer;
}
