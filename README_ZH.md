[English](README.md) | [한국어](README_KOR.md) | [日本語](README_JP.md) | [简体中文](README_ZH.md)
<div align="center">

# Comfy Mobile UI

https://github.com/user-attachments/assets/20480b56-5c01-4c27-9401-0d4ba455dd81

**专为 ComfyUI 设计的移动优先、节点式 Web 界面**

[核心功能](#features) | [安装指南](#installation) | [参与贡献](#contributing) | [给予支持](#support)

---

<p align="left">
  <img src="https://img.shields.io/badge/Platform-Mobile_First_Web-success?style=flat-square&logo=pwa" alt="Platform">
  <img src="https://img.shields.io/badge/Backend-ComfyUI-blueviolet?style=flat-square" alt="ComfyUI">
  <img src="https://img.shields.io/github/license/jaeone94/comfy-mobile-ui?style=flat-square" alt="License">
</p>
</div>

---

## 📖 简介

**Comfy Mobile UI** 是一款移动优先的 Web 界面，旨在让原本为 PC 环境优化的节点式 AI 工作流在移动设备上也能流畅运行。

它不仅仅是一个简单的查看器。你可以在旅途中修改复杂的工作流、添加新节点、管理模型，并实时监控执行状态。通过专为触屏优化的 UX，在掌中重现桌面级的体验。

---

## <a name="features"></a>✨ 核心功能

### 1. 多模式支持 (Multi-Mode Support)
同时提供可自由编辑工作流的强大 **Graph View**，以及按类型对节点进行分组、直观修改参数（Widget）的 **Stack View**。

<div align="center">
  <img src="./public/showcases/graph_view.png" width="45%" alt="Graph View" />
  <img src="./public/showcases/stack_view.png" width="45%" alt="Stack View" />
</div>

### 2. 触屏优先 UX (Touch-First UX)
为移动端手势完美重构了复杂的桌面编辑体验。
- **径向菜单 (Radial Menu):** 通过长按即可快速调用添加/删除节点、更改颜色及切换执行模式（Always, Mute, Bypass）等功能。
- **高级参数编辑器 (Advanced Widget Editor):** 在专用的大型模态框中舒适地编辑节点参数。支持从设备相册或生成画廊中轻松导入图像和视频。
- **精准链接:** 专为小屏幕设计的拖拽界面，让你能够精确地配置节点间的连线。

<div align="center">
  <img src="./public/showcases/long_press_circular_control.png" width="30%" alt="Longpress Circular Control" />
  <img src="./public/showcases/edit_widget.png" width="30%" alt="Node Widget Editor" />
  <img src="./public/showcases/connect_link.png" width="30%" alt="Node Connection" />
</div>

### 3. 执行与监控 (Execution & Monitoring)
提供实时追踪执行状态和管理队列的强大工具。
- **实时进度:** 视觉化监控当前运行的节点和整体执行进度。
- **服务器控制台:** 实时查看服务器执行日志，掌握系统运行状态。

<div align="center">
  <img src="./public/showcases/console.png" width="45%" alt="Workflow Execution Console" />
  <img src="./public/showcases/progress.png" width="45%" alt="Workflow Execution Progress" />
</div>

### 4. 便捷资源下载器 (Resource Downloader)
无需手动访问服务器，仅凭 URL 即可直接安装所需模型。
- **远程下载:** 支持通过 Hugging Face、Civitai 等链接将模型直接下载至服务器。
- **目录选择:** 可自定义下载存放的文件夹，按模型类型进行系统化管理。

<div align="center">
  <img src="./public/showcases/download_model.png" width="45%" alt="Model Download Manager" />
  <img src="./public/showcases/model_management.png" width="45%" alt="Model Management" />
</div>

### 5. 统一媒体库 (Unified Media Library)
在应用内即时查看和管理生成的图像及视频 (MP4)，无需切换至相册。
- **内置画廊:** 提供从高清大图到视频预览的流畅播放和查看体验。
- **无缝导出:** 即时检查输出结果，并保存至本地存储或分享至外部。

<div align="center">
  <img src="./public/showcases/album.png" width="45%" alt="Output Gallery" />
  <img src="./public/showcases/album2.png" width="45%" alt="Video Player" />
</div>

### 6. 高级实用工具 (Advanced Utilities)
提供一系列智能工具，让工作流的编辑与管理更高效。
- **工作流快照 (Snapshots):** 保存当前工作流状态并随时恢复，无惧参数实验。
- **集成组控制 (Group Control):** 内置 Fast Group Muter/Bypasser 映射功能，可批量控制组内节点的执行模式。
- **触发词管理:** 为每个 LoRA 预设触发词，编辑工作流时可快速查阅并复制。
- **视频下载增强:** 利用 [yt-dlp](https://github.com/yt-dlp/yt-dlp) 将各平台视频直接下载至服务器 `input` 文件夹。
- **工作流链 (Experimental):** 将多个独立工作流串联，实现复杂的自动化顺序执行。

---

## <a name="installation"></a>🛠️ 安装与设置

### **1. 标准安装 (推荐)**
最简单的入门方式：

1. **下载**: 前往 [Latest Release](https://github.com/jaeone94/comfy-mobile-ui/releases) 页面下载 `comfy-mobile-ui-api-extension-vX.X.X.zip`。
2. **解压**: 在你的电脑上解压该文件。
3. **部署**: 将解压得到的 `comfy-mobile-ui-api-extension` 文件夹复制到 ComfyUI 的 `custom_nodes/` 目录下。
   - **3.5. 安装依赖 (便携版用户)**: 如果你使用的是没有安装 ComfyUI-Manager 的 **纯净版 ComfyUI Windows Portable**，请运行插件文件夹内的 `install-requirements-for-comfyui-portable.bat` 以安装所需的依赖库。
4. **启动**: 使用必需的参数启动 (或重启) ComfyUI：
   ```bash
   python main.py --enable-cors-header
   ```
5. **访问**: 打开移动端浏览器，访问 `http://你的服务器IP:9188` (或在本地运行时访问 `http://localhost:9188`)。详见 [连接指南](./docs/connection_guide_zh.md)。

---

## <a name="contributing"></a>🤝 参与贡献

**非常欢迎您的贡献！**

### **关于代码质量**
本应用的大部分代码是通过“氛围感编程 (Vibe Coding)”开发的，因此代码质量可能参差不齐。感谢您的理解，并欢迎任何改进意见！

---

## <a name="support"></a>⭐ 给予支持

⭐ **如果你觉得这个应用好用，请考虑给它点个 Star！** ⭐

你的支持是项目成长和持续开发的巨大动力。

---
