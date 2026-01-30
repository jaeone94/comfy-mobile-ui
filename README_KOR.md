
[English](README.md) | [한국어](README_KOR.md) | [日本語](README_JP.md) | [简体中文](README_ZH.md)
<div align="center">

# Comfy Mobile UI


https://github.com/user-attachments/assets/53ace07b-d060-4147-9ea4-cbc72a3bd059

**ComfyUI를 위한 모바일 우선, 노드 스타일 웹 인터페이스**

[Key Features](#features) | [설치 가이드](#installation) | [기여하기](#contributing) | [응원하기](#support)

---

<p align="left">
  <img src="https://img.shields.io/badge/Platform-Mobile_First_Web-success?style=flat-square&logo=pwa" alt="Platform">
  <img src="https://img.shields.io/badge/Backend-ComfyUI-blueviolet?style=flat-square" alt="ComfyUI">
  <img src="https://img.shields.io/github/license/jaeone94/comfy-mobile-ui?style=flat-square" alt="License">
</p>
</div>

## 📖 Introduction

**Comfy Mobile UI**는 PC 환경에 최적화되었던 노드 기반 AI 워크플로우를 모바일 기기에서도 원활하게 다룰 수 있도록 설계된 모바일 우선 웹 인터페이스입니다.

단순한 뷰어가 아닙니다. 이동 중에도 복잡한 워크플로우를 수정하고, 새로운 노드를 추가하고, 모델을 관리하고, 실행 상태를 실시간으로 모니터링하세요. 터치 환경에 최적화된 UX로 데스크톱의 경험을 손안에서 그대로 재현합니다.

---

## <a name="features"></a>✨ Key Features

### 1. 멀티 모드 지원 (Multi-Mode Support)
ComfyUI 워크플로우를 자유롭게 편집할 수 있는 강력한 **Graph View**와, 노드들을 유형별로 그룹화하여 위젯 값을 직관적으로 수정할 수 있는 **Stack View**를 동시에 제공합니다.

<div align="center">
  <img src="./public/showcases/graph_view.png" width="45%" alt="Graph View" />
  <img src="./public/showcases/stack_view.png" width="45%" alt="Stack View" />
</div>

### 2. 터치에 최적화된 노드 조작 (Touch-First UX)
모바일 환경에서도 복잡한 노드 그래프를 직관적으로 제어할 수 있도록 최적화된 사용자 경험을 제공합니다.
- **Radial Menu:** 롱 프레스 한 번으로 노드 추가, 제거, 색상 변경 및 실행 모드(Always, Mute, Bypass) 전환 기능을 빠르게 호출합니다.
- **Advanced Widget Editor:** 전용 모달 화면에서 노드 위젯을 편하게 편집할 수 있습니다. 특히 기기의 앨범이나 출력 결과물 갤러리에서 이미지와 비디오를 간편하게 가져올 수 있습니다.
- **Precision Linking:** 작은 화면에서도 편리한 드래그 앤 드롭 인터페이스를 통해 노드 사이의 연결선을 정밀하게 구성합니다.

<div align="center">
  <img src="./public/showcases/long_press_circular_control.png" width="30%" alt="Longpress Circular Control" />
  <img src="./public/showcases/edit_widget.png" width="30%" alt="Node Widget Editor" />
  <img src="./public/showcases/connect_link.png" width="30%" alt="Node Connection" />
</div>

### 3. 워크플로우 실행 및 모니터링 (Execution & Monitoring)
실행 현황을 실시간으로 추적하고 대기열을 관리하는 강력한 도구를 제공합니다.
- **Live Progress:** 실행 중인 노드를 시각적으로 확인하고 전체 진행률을 실시간으로 파악합니다.
- **Server Console:** 서버의 실행 로그를 실시간으로 모니터링하여 가동 상태를 확인합니다.

<div align="center">
  <img src="./public/showcases/console.png" width="45%" alt="Workflow Execution Console" />
  <img src="./public/showcases/progress.png" width="45%" alt="Workflow Execution Progress" />
</div>

### 4. 편리한 리소스 다운로드 (Resource Downloader)
서버에 직접 접속할 필요 없이 URL만으로 필요한 모델을 즉시 설치할 수 있습니다.
- **Remote Download:** Hugging Face나 Civitai 등의 모델 링크를 통해 체크포인트, LoRA 등을 서버로 직접 다운로드합니다.
- **Target Folder Selection:** 다운로드 시 저장될 대상 폴더를 직접 지정하여 모델 종류에 맞게 체계적으로 관리합니다.

<div align="center">
  <img src="./public/showcases/download_model.png" width="45%" alt="Model Download Manager" />
  <img src="./public/showcases/model_management.png" width="45%" alt="Model Management" />
</div>

### 5. 통합 미디어 라이브러리 (Unified Media Library)
생성된 이미지와 비디오(MP4)를 앱 내에서 별도의 갤러리 앱 없이 즉시 확인하고 관리합니다.
- **In-App Gallery:** 고화질 결과물부터 비디오 프리뷰까지 매끄러운 재생 및 확인 환경을 제공합니다.
- **Seamless Export:** 결과물을 즉시 확인하고 로컬 저장소로 저장하거나 외부로 공유할 수 있습니다.
<div align="center">
  <img src="./public/showcases/album.png" width="45%" alt="Output Gallery" />
  <img src="./public/showcases/album2.png" width="45%" alt="Video Player" />
</div>

### 6. 다양한 작업 편의 도구 (Advanced Utilities)
워크플로우 편집과 관리를 더욱 효율적으로 만들어주는 스마트한 도구들을 제공합니다.
- **Workflow Snapshots:** 워크플로우의 현재 상태를 스냅샷으로 저장하고 언제든지 복구할 수 있습니다. 파라미터를 실험하며 최적의 값을 찾을 때 데이터 손실 걱정 없이 자유로운 테스트가 가능합니다.
- **Embedded Group Control:** rgthree의 Fast Group Muter/Bypasser 기능을 내장하여, 어떤 워크플로우에서든 그룹 내 모든 노드의 실행 모드(`Always`, `Mute`, `Bypass`)를 일괄적으로 제어할 수 있습니다.
- **Trigger Word Manager:** 모델 브라우저에서 LoRA별 트리거 워드를 미리 저장해 관리할 수 있습니다. 기억하기 어려운 키워드를 워크플로우 편집 시 즉시 조회하고 복사하여 작업 효율을 높입니다.
- **Advanced Video Downloader:** [yt-dlp](https://github.com/yt-dlp/yt-dlp)를 활용해 다양한 플랫폼의 영상을 서버의 `input` 폴더로 직접 다운로드하여 워크플로우의 소스로 즉시 활용할 수 있습니다.
- **Workflow Chain (Experimental):** 독립적인 여러 워크플로우를 하나로 연결합니다. 한 워크플로우의 결과물을 다음 단계의 입력값으로 자동 전송하여 복잡한 순차 실행 프로세스를 자동화합니다.

---

## <a name="installation"></a>🛠️ Installation & Setup

### **1. 일반 설치 (권장)**
가장 쉽고 빠른 설치 방법입니다:

1. **다운로드**: [최신 릴리즈](https://github.com/jaeone94/comfy-mobile-ui/releases) 페이지에서 `comfy-mobile-ui-api-extension-vX.X.X.zip` 파일을 다운로드합니다.
2. **압축 해제**: 다운로드한 파일의 압축을 풉니다.
3. **복사**: 압축을 풀어 나온 `comfy-mobile-ui-api-extension` 폴더를 ComfyUI의 `custom_nodes/` 디렉토리에 복사합니다.
4. **재시작**: 아래 플래그를 포함하여 ComfyUI를 실행 또는 재시작합니다:
   ```bash
   python main.py --enable-cors-header
   ```
5. **접속**: 브라우저를 열고 `http://서버-IP:9188` (로컬 실행 시 `http://localhost:9188`)로 접속합니다. 자세한 내용은 [접속 가이드](./docs/connection_guide_kor.md)를 참고하세요.

### **2. 개발자 설정 / 수동 설치**
프로젝트에 기여하거나 소스 코드에서 직접 빌드하고 싶은 경우:

#### **필수 요구사항**
- Node.js 18+ 및 npm
- ComfyUI 서버 실행 (일반적으로 `http://localhost:8188`)

#### **수동 API 확장 설정**
1. **저장소 클론**:
   ```bash
   git clone https://github.com/jaeone94/comfy-mobile-ui.git
   cd comfy-mobile-ui
   ```
2. **API 확장 복사**:
   ```bash
   # comfy-mobile-ui-api-extension 폴더를 ComfyUI custom_nodes 디렉토리에 복사
   cp -r comfy-mobile-ui-api-extension /path/to/your/comfyui/custom_nodes/
   ```

#### **개발용 서버 실행**
```bash
# 의존성 설치
npm install

# 개발 서버 시작
npm run dev

# 브라우저에서 열기: http://localhost:5173
```

#### **프로덕션 빌드**

```bash
# 프로덕션용 빌드
npm run build

# 프로덕션 빌드 미리보기
npm run preview

# 코드 린트
npm run lint
```

### **수동 설치 시 확인사항**

ComfyUI 설치에서 확인사항:

1. **API 확장 설치**: `comfy-mobile-ui-api-extension`을 `custom_nodes/`에 복사
2. **CORS 활성화**: `--enable-cors-header` 플래그로 시작
3. **네트워크 액세스**: 네트워크 액세스를 위해 `--listen 0.0.0.0` 사용 (선택사항)

```bash
# ComfyUI 시작 명령 예시
python main.py --enable-cors-header --listen 0.0.0.0
```

---

## <a name="contributing"></a>🤝 Contributing

**기여는 언제나 환영합니다!**

### **코드 품질 안내**
이 앱의 대부분은 "바이브 코딩"으로 개발되었으므로 코드 품질이 떨어질 수 있습니다. 양해를 부탁드리며 개선을 환영합니다!

### **기여 방법**
1. 저장소 포크
2. 기능 브랜치 생성 (`git checkout -b feature/amazing-feature`)
3. 변경사항 커밋 (`git commit -m 'Add amazing feature'`)
4. 브랜치에 푸시 (`git push origin feature/amazing-feature`)
5. Pull Request 열기

---

## <a name="support"></a>⭐ 응원하기

⭐ **이 앱이 유용하다고 생각되시면 스타를 눌러주세요!** ⭐

여러분의 응원은 프로젝트 성장에 큰 힘이 됩니다.

---
