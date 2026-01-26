# ComfyUI Mobile UI API Extension - Watchdog Service
# Provides self-restart capability for ComfyUI

import subprocess
import threading
import time
import os
import sys
import signal
import json
import psutil
from typing import Optional
from pathlib import Path

# --- Bootstrap Update Logic ---
def perform_bootstrap_update():
    """Check for and apply updates from .update_staging before starting the application"""
    extension_root = Path(__file__).parent
    staging_dir = extension_root / ".update_staging"
    
    if staging_dir.exists() and staging_dir.is_dir():
        print(f"🚀 [UPDATE] Update staging folder detected: {staging_dir}")
        try:
            # 1. Verification (simple check)
            if not (staging_dir / "version.json").exists():
                print(f"⚠️ [UPDATE] version.json missing in staging. Aborting update.")
                return

            # 2. Perform Swap
            print(f"📦 [UPDATE] Applying update... and cleaning up staging.")
            
            # We iterate through everything in staging_dir
            for item in staging_dir.iterdir():
                if item.name == "version.json":
                    # Update version.json last? Or just copy.
                    shutil.copy2(item, extension_root / "version.json")
                elif item.is_dir():
                    target_dir = extension_root / item.name
                    if target_dir.exists():
                        shutil.rmtree(target_dir)
                    shutil.copytree(item, target_dir)
                else:
                    target_file = extension_root / item.name
                    shutil.copy2(item, target_file)
            
            # 3. Clean up
            shutil.rmtree(staging_dir)
            print(f"✅ [UPDATE] Update applied successfully!")
            
        except Exception as e:
            print(f"❌ [UPDATE] Failed to apply update: {e}")

# Run update before anything else
import shutil
perform_bootstrap_update()
# --- End Bootstrap Update Logic ---

class ComfyUILauncher:
    """
    External launcher process manager (internal watchdog removal)
    """
    
    def __init__(self, comfyui_path: str = None, comfyui_port: int = 8188, comfyui_script: str = "main.py"):
        # External launcher process related
        self.external_launcher_process: Optional[subprocess.Popen] = None
        self.launcher_script_path = Path(__file__).parent / "launcher_service.py"
        self.launcher_port = 9188  # Launcher API port (fixed)
        
        # ComfyUI related settings (may vary per user)
        self.comfyui_path = comfyui_path or os.getcwd()  # ComfyUI installation path
        self.comfyui_port = comfyui_port  # ComfyUI server port
        self.comfyui_script = comfyui_script  # ComfyUI main script
        
        # ComfyUI original launch args file
        self.original_args_file = Path(__file__).parent / "comfyui_original_args.json"
        
        # Save ComfyUI original launch args (once per watchdog start)
        self._save_original_comfyui_args()
    
    def _save_original_comfyui_args(self):
        """Save ComfyUI original launch args (once per watchdog start)"""
        try:
            # Extract ComfyUI launch args from current environment
            from .comfyui_detector import get_comfyui_launch_args
            original_args = get_comfyui_launch_args()
            
            # Save launch args (overwrite each time)
            import json
            with open(self.original_args_file, 'w', encoding='utf-8') as f:
                json.dump({
                    'args': original_args,
                    'cwd': os.getcwd(),
                    'saved_at': time.strftime('%Y-%m-%d %H:%M:%S'),
                    'comfyui_script': self.comfyui_script,
                    'comfyui_port': self.comfyui_port
                }, f, indent=2)
            
            print(f"[SUCCESS] ComfyUI current launch args saved (overwrite): {original_args}")
            
        except Exception as e:
            print(f"[ERROR] Failed to save ComfyUI launch args: {e}")
            raise
    
    def _get_original_comfyui_args(self) -> list:
        """Return saved ComfyUI original launch args"""
        try:
            if self.original_args_file.exists():
                import json
                with open(self.original_args_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    args = data.get('args', [])
                    print(f"📋 Using saved ComfyUI original launch args: {args}")
                    return args
            else:
                print(f"⚠️ No saved launch args file, using default args")
                return []
        except Exception as e:
            print(f"❌ Failed to load saved launch args: {e}, using default args")
            return []
        
    def start_launcher(self) -> bool:
        """
        Start external launcher process
        
        Returns:
            bool: Start success status
        """
        return self.start_external_launcher()
    
    def start_external_launcher(self) -> bool:
        """Start external launcher process"""
        try:
            if not self.launcher_script_path.exists():
                print(f"❌ External launcher script not found: {self.launcher_script_path}")
                return False
            
            # Check if launcher is already running
            try:
                import requests
                response = requests.get(f"http://localhost:{self.launcher_port}/", timeout=3)
                if response.status_code == 200:
                    print(f"[WARN] External launcher already running on port {self.launcher_port}")
                    return True  # Already running, treat as success
            except:
                pass  # Not running, continue
            
            # Use original ComfyUI launch args (saved or default)
            # Launcher must preserve ComfyUI's original launch args
            launch_args = self._get_original_comfyui_args()
            
            # Combine main script and launch args
            full_args = [self.comfyui_script] + launch_args
            
            # Start external launcher process (JSON file is already created)
            cmd = [
                sys.executable,
                # Force script name for clarity
                str(Path(__file__).parent / "launcher_service.py"),
                '--api-port', str(self.launcher_port)  # 9188 directly passed
            ]
            
            print(f"[START] Starting external launcher: {' '.join(cmd)}")
            
            # Start as independent process group with visible terminal
            if os.name == 'nt':  # Windows
                # Create independent process group with visible terminal
                creation_flags = subprocess.CREATE_NEW_CONSOLE | subprocess.CREATE_NEW_PROCESS_GROUP
                
                self.external_launcher_process = subprocess.Popen(
                    cmd,
                    creationflags=creation_flags,
                    # Do not redirect stdout/stderr to new terminal window
                )
            else:  # Unix/Linux/Mac
                # Create independent process group with visible terminal
                self.external_launcher_process = subprocess.Popen(
                    cmd,
                    preexec_fn=os.setsid,  # Create new session for complete independence
                    # Run in background on current terminal while showing output
                )
            
            launcher_pid = self.external_launcher_process.pid
            print(f"✅ External launcher started (PID: {launcher_pid})")
            
            # Detach process for complete independence
            # Prevent launcher from being affected by parent process termination
            self.external_launcher_process = None
            
            # Only log PID and do not maintain reference
            print(f"🔄 Launcher process detached for complete independence (PID: {launcher_pid})")
            return True
            
        except Exception as e:
            print(f"❌ Failed to start external launcher: {e}")
            return False
    
    def stop_external_launcher(self) -> bool:
        """Stop external launcher process (API-based)"""
        try:
            print("🛑 Requesting external launcher shutdown...")
            
            # API to gracefully request shutdown
            import requests
            try:
                response = requests.post(f"http://localhost:{self.launcher_port}/shutdown", timeout=5)
                if response.status_code == 200:
                    result = response.json()
                    print(f"✅ Launcher shutdown requested: {result.get('message', 'Success')}")
                    return True
                else:
                    print(f"⚠️ Launcher shutdown request failed: {response.status_code}")
            except Exception as api_error:
                print(f"⚠️ Could not request graceful shutdown: {api_error}")
            
            # API method failed but launcher is independent, so treat as success
            print("ℹ️ Launcher is independent")
            return True
            
        except Exception as e:
            print(f"❌ Error stopping external launcher: {e}")
            return False
    
    def stop_launcher(self):
        """Stop launcher service"""
        return self.stop_external_launcher()
    
    def request_restart(self) -> bool:
        """
        Request restart through external launcher
        
        Returns:
            bool: Request success status
        """
        try:
            import requests
            response = requests.post(f"http://localhost:{self.launcher_port}/restart", timeout=10)
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Launcher restart requested: {result.get('message', 'Success')}")
                return result.get('success', False)
            else:
                print(f"❌ Launcher API response error: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Launcher API communication error: {e}")
            return False
    
    def get_status(self) -> dict:
        """
        Get external launcher status
        
        Returns:
            dict: Status information
        """
        # API to get detailed status (independent launcher, so use API only)
        api_status = None
        process_status = {
            "running": False,
            "pid": None
        }
        
        try:
            import requests
            response = requests.get(f"http://localhost:{self.launcher_port}/status", timeout=5)
            if response.status_code == 200:
                api_status = response.json()
                # API response indicates launcher is running
                process_status["running"] = True
                # Use PID from API response if available
                if api_status and isinstance(api_status, dict):
                    process_status["pid"] = api_status.get("pid")
        except Exception as e:
            print(f"⚠️ Launcher API status query failed: {e}")
        
        return {
            "process": process_status,
            "api_port": self.launcher_port,
            "api_status": api_status
        }

# Global launcher instance
_launcher_instance: Optional[ComfyUILauncher] = None

def get_launcher(comfyui_path: str = None, comfyui_port: int = 8188, comfyui_script: str = "main.py") -> ComfyUILauncher:
    """
    Return launcher singleton instance
    
    Args:
        comfyui_path: ComfyUI installation path
        comfyui_port: ComfyUI server port
        comfyui_script: ComfyUI main script filename
        
    Returns:
        ComfyUILauncher: Launcher instance
    """
    global _launcher_instance
    if _launcher_instance is None:
        _launcher_instance = ComfyUILauncher(comfyui_path, comfyui_port, comfyui_script)
    return _launcher_instance

def initialize_launcher(comfyui_path: str = None, comfyui_port: int = None, comfyui_script: str = None) -> bool:
    """
    Initialize and start launcher (auto-detection support)
    
    Args:
        comfyui_path: ComfyUI installation path (None for auto-detection)
        comfyui_port: ComfyUI server port (None for auto-detection)
        comfyui_script: ComfyUI main script filename (None for auto-detection)
        
    Returns:
        bool: Initialization success status
    """
    try:
        # Parameters not specified, auto-detect
        if comfyui_path is None or comfyui_port is None or comfyui_script is None:
            from .comfyui_detector import detect_comfyui_environment
            detected_path, detected_port, detected_script = detect_comfyui_environment()
            
            # Use auto-detect values for unspecified parameters
            comfyui_path = comfyui_path or detected_path
            comfyui_port = comfyui_port or detected_port
            comfyui_script = comfyui_script or detected_script
        
        launcher = get_launcher(comfyui_path, comfyui_port, comfyui_script)
        return launcher.start_launcher()
    except Exception as e:
        print(f"[ERROR] Launcher initialization failed: {e}")
        return False

def shutdown_launcher():
    """Stop launcher service"""
    global _launcher_instance
    if _launcher_instance:
        _launcher_instance.stop_launcher()
        _launcher_instance = None