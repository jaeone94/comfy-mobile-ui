[English](./connection_guide.md) | [한국어](./connection_guide_kor.md) | [日本語](./connection_guide_jp.md) | [简体中文](./connection_guide_zh.md)

# ComfyUI Mobile UI 连接指南

本指南说明了将移动设备连接到 ComfyUI 服务器的完整步骤。

## 步骤 0: 访问 ComfyUI Mobile UI
在配置服务器设置之前，必须先在移动浏览器中访问“Mobile UI”网页界面。

<div align="center">
  <img src="./connection_guide_capture_1.png" width="100%" alt="Mobile UI Console" />
</div>

> [!TIP]
> 扩展程序启动时，请参考控制台显示的 **"🚀 ComfyUI Mobile API is ready!"** 下方的地址列表。
> - **相同 WiFi 环境:** `http://192.168.x.x:9188` (使用 9188 端口)
> - **外部/VPN 环境:** `http://100.x.x.x:9188` 等控制台中显示的可用网络地址

---

## 步骤 1: 配置 ComfyUI 服务器连接
访问 Mobile UI 后，在应用内的 **[Server Settings]** 菜单中连接到实际的 ComfyUI 引擎（默认 8188 端口）。

## 📱 服务器连接界面
<div align="center">
  <img src="./connection_guide_capture_2.png" width="40%" alt="Server Connection Screen" />
  <img src="./connection_guide_capture_3.png" width="40%" alt="Server Connection Screen2" />
</div>
> *在“Server Settings”菜单中，输入适合您环境的地址。*

### 1. 在相同 WiFi (局域网) 环境下
手机和电脑连接到同一个 WiFi 路由器时。
- 请输入运行服务器的电脑的 **私有 IP (Private IP)**。
- **输入示例:** `http://192.168.0.85:8188`

### 2. 从外部网络连接时 (LTE/5G/外部 WiFi)
若要在室外访问，服务器必须准备好接收外部请求。
- **必要条件:** 启动 ComfyUI 时必须添加 `--listen` 或 `--listen 0.0.0.0` 参数。
- **方法:** 使用 **Tailscale** 等 VPN 服务，或在路由器上设置 **端口转发**。
- **核心点:** 无论使用何种工具，必须输入 **移动浏览器实际可以访问的 IP 地址**。(例如：`http://100.90.xx.xx:8188`)

> [!CAUTION]
> **安全警告 (防止黑客攻击)**
> 使用端口转发时，为了安全起见，强烈建议将路由器的 **外部端口 (External Port)** 设置为与电脑的 **内部端口 (8188)** 不同的数值。
> (例如：将外部 12345 端口转发到内部 8188 端口)

### 3. 在 ComfyUI 中使用证书 (SSL/TLS) 时
在启动参数中添加了 `--tls-keyfile` 和 `--tls-certfile` 的情况。
- 在这种情况下，ComfyUI **仅允许 `https://` 连接**。
- 必须在地址前加上 `https://`，并确认该地址在移动设备上可以进行 SSL 连接。
- **输入示例:** `https://192.168.0.85:8188`
