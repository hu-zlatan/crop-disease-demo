// Rear-camera capture. getUserMedia requires HTTPS (or localhost).

let stream = null;

export function cameraSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

export async function startCamera(video) {
  if (!cameraSupported()) {
    const err = new Error("insecure-context");
    err.name = "InsecureContextError";
    throw err;
  }
  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 1280 },
    },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
}

export function stopCamera() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
}

// Returns a square canvas: a centre crop of the current video frame.
export function captureFrame(video) {
  const s = Math.min(video.videoWidth, video.videoHeight);
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const ctx = c.getContext("2d");
  const sx = (video.videoWidth - s) / 2;
  const sy = (video.videoHeight - s) / 2;
  ctx.drawImage(video, sx, sy, s, s, 0, 0, s, s);
  return c;
}

export function cameraErrorMessage(e) {
  switch (e && e.name) {
    case "InsecureContextError":
      return (
        "The camera needs an HTTPS address. Please open this page over https://\n" +
        "摄像头需要 HTTPS 网址才能使用，请通过 https:// 链接打开本页面。"
      );
    case "NotAllowedError":
    case "SecurityError":
      return (
        "Camera permission denied. Allow camera access for this site, then retry.\n" +
        "摄像头权限被拒绝，请在浏览器设置中允许本网站使用摄像头后重试。"
      );
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera device found.\n未检测到摄像头设备。";
    case "NotReadableError":
      return (
        "The camera is in use by another app. Close it and retry.\n" +
        "摄像头被其他应用占用，请关闭后重试。"
      );
    default:
      return (
        "Could not start the camera 无法启动摄像头: " +
        (e && e.message ? e.message : e)
      );
  }
}
