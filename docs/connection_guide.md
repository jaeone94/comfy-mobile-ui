[English](./connection_guide.md) | [한국어](./connection_guide_kor.md) | [日本語](./connection_guide_jp.md) | [简体中文](./connection_guide_zh.md)

# ComfyUI Mobile UI Connection Guide

This guide explains the step-by-step process of connecting your mobile device to your ComfyUI server.

## Step 0: Accessing the ComfyUI Mobile UI
Before configuring server settings, you must first access the 'Mobile UI' web interface on your mobile browser.

<div align="center">
  <img src="./connection_guide_capture_1.png" width="100%" alt="Mobile UI Console" />
</div>

> [!TIP]
> When the API Extension starts, check the console output under **"🚀 ComfyUI Mobile API is ready!"** for available addresses.
> - **Same WiFi:** `http://192.168.x.x:9188` (Uses port 9188)
> - **External/VPN:** `http://100.x.x.x:9188` or other network IPs shown in the console.

---

## Step 1: Configuring ComfyUI Server Connection
After accessing the Mobile UI, go to the **[Server Settings]** menu to connect with the actual ComfyUI engine (default port 8188).

## 📱 Server Connection Screen
<div align="center">
  <img src="./connection_guide_capture_2.png" width="40%" alt="Server Connection Screen" />
  <img src="./connection_guide_capture_3.png" width="40%" alt="Server Connection Screen2" />
</div>
> *In the "Server Settings" menu, enter the appropriate address for your environment.*

### 1. Connecting via Same WiFi (Local Network)
If your mobile phone and PC are connected to the same WiFi router:
- Find the **Private IP** of the PC running the server.
- **Example:** `http://192.168.0.85:8188`

### 2. Connecting from External Networks (LTE/5G/External WiFi)
To access your server while away from home, the server must be prepared for external requests.
- **Prerequisite:** Start ComfyUI with the `--listen` or `--listen 0.0.0.0` argument.
- **Method:** Use a VPN service like **Tailscale** or configure **Port Forwarding** on your router.
- **Key Point:** Regardless of the method, you must enter the IP address that is **actually reachable** from your mobile browser. (e.g., `http://100.90.xx.xx:8188`)

> [!CAUTION]
> **Security Warning (Hacking Prevention)**
> When using Port Forwarding, it is strongly recommended to use a different **External Port** on your router than the **Internal Port (8188)** of your PC for better security.
> (e.g., Forwarding External Port 12345 -> Internal Port 8188)

### 3. SSL/TLS (HTTPS) Considerations
If certificates are provided to ComfyUI via launch arguments (`--tls-keyfile`, `--tls-certfile`):
- ComfyUI will **only allow HTTPS** connections.
- You must use `https://` in the address and verify that the address is SSL-reachable from your mobile device.
- **Example:** `https://192.168.0.85:8188`
