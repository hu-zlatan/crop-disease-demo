# 作物叶片病害识别 · 手机端演示

一个纯静态网页：观众用手机扫码打开后，可用后置摄像头拍摄植物叶片，**全部推理在手机浏览器本地完成**（ONNX Runtime Web），无需后端服务器。另含一个数据集展示页，每 15 秒自动轮换 PlantVillage 测试集样图并标注真实分类。

模型：LiteCrop-OLC-S（OverviewGate），PlantVillage color-38，38 类。

## 目录结构

```
index.html            页面
css/ js/               样式与逻辑
model/                 litecrop_color38.onnx + classes.json
assets/gallery/        画廊样图（数据集 test 集，含真实标签）
gallery.json           画廊清单
vendor/ort/            ONNX Runtime Web 运行时（本地托管，不依赖 CDN）
sw.js                  Service Worker（缓存模型与运行时，二次访问秒开）
serve.py               本地测试用的开发服务器
```

## 本地测试

```
python serve.py
```

浏览器打开 http://localhost:8000 。localhost 被视为安全上下文，摄像头可用。

## 部署到 GitHub Pages

本文件夹的内容即为仓库根目录。首次部署：

```
git init
git add -A
git commit -m "Crop disease demo web app"
git branch -M main
git remote add origin https://github.com/hu-zlatan/crop-disease-demo.git
git push -u origin main
```

然后在 GitHub 仓库 **Settings → Pages → Build and deployment**：
Source 选 **Deploy from a branch**，分支 `main`，目录 `/ (root)`。
几分钟后网址为 `https://hu-zlatan.github.io/crop-disease-demo/`。

Service Worker 对 HTML/JS/CSS 用 network-first（改动重新部署后会自动生效），
只对大文件（模型 / 运行时 / 图片）用 cache-first。仅当**更换了这些大文件**时，
才需把 `sw.js` 里的 `CACHE` 版本号递增（如 `crop-demo-v5` → `v6`）。

## 重新生成模型 / 画廊

模型与画廊由主项目 `code/scripts/` 下的脚本生成：

```
python scripts/export_onnx.py         # -> web/model/litecrop_color38.onnx + classes.json
python scripts/build_demo_gallery.py  # -> web/assets/gallery/ + web/gallery.json
python scripts/calibrate_ood.py       # -> web/model/ood.json (OOD 拒识阈值)
python scripts/make_qr.py <url>       # -> web/assets/qr.svg (摄像头页二维码)
```

`make_qr.py` 默认编码当前部署地址；若仓库 / 网址变了，传入新 URL 重新生成。

`ood.json` 的 `minProb` / `maxEnergy` 可手动微调：调高 `minProb` 拒识更激进
（更能挡住非植物图，但会误拒更多真实叶片），调低则相反。

## 说明

- 当前模型为 fp32（9.4 MB）。int8 量化版在校验中掉了 2/76 张，按既定规则回退 fp32。
- 模型在 PlantVillage 实验室图像（单叶、纯背景）上训练。拍摄真实植株（杂乱背景、整株）
  时准确率会下降——演示时建议对准单片叶子、背景干净。数据集展示页为同分布数据，可稳定展示高准确率。
- **OOD 拒识**：38 类闭集模型对非植物图也会强行分类，故加了能量+置信度阈值门控
  （`ood.json`）。拍到的图若置信度过低/能量过高，会显示「未检测到可识别的植物叶片」。
  这是后处理方案，能挡住明显的非叶片输入，但并非万无一失。
- Service Worker 仅在线上（非 localhost）启用；本地 `serve.py` 测试时不缓存，便于看到改动。
