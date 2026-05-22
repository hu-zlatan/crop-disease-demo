// Replicates the project's eval transform (code/src/data/transforms.py):
//   Resize(short side -> 182) -> CenterCrop(160) -> /255 -> ImageNet normalize.
// 182 = int(160 * 256 / 224). Output: ort.Tensor float32 [1,3,160,160], NCHW.

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const INPUT = 160;
const RESIZE = 182;

const _canvas = document.createElement("canvas");
const _ctx = _canvas.getContext("2d", { willReadFrequently: true });

export function preprocess(source) {
  const sw = source.videoWidth || source.naturalWidth || source.width;
  const sh = source.videoHeight || source.naturalHeight || source.height;
  const scale = RESIZE / Math.min(sw, sh);
  const rw = Math.max(INPUT, Math.round(sw * scale));
  const rh = Math.max(INPUT, Math.round(sh * scale));

  _canvas.width = rw;
  _canvas.height = rh;
  _ctx.imageSmoothingEnabled = true;
  _ctx.imageSmoothingQuality = "high";
  _ctx.drawImage(source, 0, 0, rw, rh);

  const sx = Math.floor((rw - INPUT) / 2);
  const sy = Math.floor((rh - INPUT) / 2);
  const { data } = _ctx.getImageData(sx, sy, INPUT, INPUT);

  const plane = INPUT * INPUT;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    out[i] = (r - MEAN[0]) / STD[0];
    out[plane + i] = (g - MEAN[1]) / STD[1];
    out[2 * plane + i] = (b - MEAN[2]) / STD[2];
  }
  return new ort.Tensor("float32", out, [1, 3, INPUT, INPUT]);
}
