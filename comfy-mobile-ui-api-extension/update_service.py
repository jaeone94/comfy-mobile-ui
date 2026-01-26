import os
import json
import shutil
import requests
import zipfile
import threading
import hashlib
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime

class UpdateService:
    def __init__(self, logger_callback):
        self.logger = logger_callback
        self.repo_url = "https://api.github.com/repos/jaeone94/comfy-mobile-ui/releases/latest"
        self.extension_root = Path(__file__).parent
        self.version_file = self.extension_root / "version.json"
        self.staging_dir = self.extension_root / ".update_staging"
        self.is_downloading = False
        self.download_progress = 0
        self.last_error = None

    def get_current_version(self) -> str:
        try:
            if self.version_file.exists():
                with open(self.version_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    return data.get("version", "0.0.0")
        except Exception as e:
            self.logger(f"Error reading version file: {e}", "error")
        return "0.0.0"

    def check_for_update(self) -> Dict[str, Any]:
        try:
            response = requests.get(self.repo_url, timeout=10)
            if response.status_code == 200:
                release_data = response.json()
                latest_version = release_data.get("tag_name", "").replace("v", "")
                current_version = self.get_current_version()
                
                has_update = self._is_newer_version(latest_version, current_version)
                
                # Find the primary zip asset
                assets = release_data.get("assets", [])
                asset_url = ""
                for asset in assets:
                    if asset.get("name", "").endswith(".zip"):
                        asset_url = asset.get("browser_download_url", "")
                        break

                return {
                    "has_update": has_update,
                    "latest_version": latest_version,
                    "current_version": current_version,
                    "release_notes": release_data.get("body", ""),
                    "published_at": release_data.get("published_at", ""),
                    "asset_url": asset_url,
                    "assets": assets
                }
            else:
                self.logger(f"GitHub API returned status {response.status_code}", "warning")
                return {"error": f"GitHub API error: {response.status_code}"}
        except Exception as e:
            self.logger(f"Error checking for update: {e}", "error")
            return {"error": str(e)}

    def _is_newer_version(self, latest: str, current: str) -> bool:
        try:
            def parse_version(v):
                return [int(x) for x in v.split('.')]
            return parse_version(latest) > parse_version(current)
        except:
            return latest != current

    def start_download(self, asset_url: str, expected_hash: Optional[str] = None):
        if self.is_downloading:
            return False
            
        self.is_downloading = True
        self.download_progress = 0
        self.last_error = None
        
        thread = threading.Thread(target=self._download_task, args=(asset_url, expected_hash), daemon=True)
        thread.start()
        return True

    def _download_task(self, asset_url: str, expected_hash: Optional[str] = None):
        try:
            self.logger(f"Starting update download from {asset_url}", "info")
            if expected_hash:
                self.logger(f"Expected SHA256: {expected_hash}", "debug")
            
            # 1. Clean staging directory
            if self.staging_dir.exists():
                shutil.rmtree(self.staging_dir)
            self.staging_dir.mkdir(parents=True, exist_ok=True)
            
            temp_zip = self.staging_dir / "update.zip"
            sha256_hash = hashlib.sha256()
            
            # 2. Download zip with hash calculation
            response = requests.get(asset_url, stream=True, timeout=30)
            total_size = int(response.headers.get('content-length', 0))
            
            downloaded = 0
            with open(temp_zip, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        sha256_hash.update(chunk)
                        downloaded += len(chunk)
                        if total_size > 0:
                            self.download_progress = int((downloaded / total_size) * 100)
            
            # 3. Hash Verification
            if expected_hash:
                calculated_hash = sha256_hash.hexdigest()
                if calculated_hash.lower() != expected_hash.lower():
                    raise ValueError(f"Integrity check failed! \nExpected: {expected_hash}\nActual: {calculated_hash}")
                self.logger("Integrity check passed.", "success")

            self.logger("Download complete. Extracting...", "info")
            
            # 4. Smart Extraction (handling nested root folder)
            with zipfile.ZipFile(temp_zip, 'r') as zip_ref:
                # Find the common prefix (GitHub puts everything in a subfolder)
                file_list = zip_ref.namelist()
                root_folder = os.path.commonprefix(file_list)
                
                if root_folder and not any(not f.startswith(root_folder) for f in file_list):
                    # All files are under one root folder - extract and move up
                    temp_extract_dir = self.staging_dir / "_temp_extract"
                    zip_ref.extractall(temp_extract_dir)
                    
                    actual_root = temp_extract_dir / root_folder
                    for item in actual_root.iterdir():
                        shutil.move(str(item), str(self.staging_dir))
                    shutil.rmtree(temp_extract_dir)
                else:
                    # Flat structure or mixed - extract normally
                    zip_ref.extractall(self.staging_dir)
            
            # Remove zip after extraction
            os.remove(temp_zip)
            
            self.logger("Update prepared in staging directory.", "success")
            self.is_downloading = False
            self.download_progress = 100
            
        except Exception as e:
            self.logger(f"Update download failed: {e}", "error")
            self.last_error = str(e)
            self.is_downloading = False

    def get_update_status(self) -> Dict[str, Any]:
        """Get detailed update status with FE-compatible state mapping"""
        status = "idle"
        
        if self.last_error:
            status = "error"
        elif self.is_downloading:
            status = "downloading"
        elif self.staging_dir.exists() and any(self.staging_dir.iterdir()):
            # Check if recently downloaded (within staging)
            temp_zip = self.staging_dir / "update.zip"
            if temp_zip.exists():
                status = "downloading" # Still in zip mode?? No, usually extracted.
            else:
                # If staging is ready but no zip, it means extraction is done
                status = "ready_to_restart"
        
        return {
            "status": status,
            "is_downloading": self.is_downloading,
            "progress": self.download_progress,
            "last_error": self.last_error,
            "staging_ready": self.staging_dir.exists() and any(self.staging_dir.iterdir()),
            "current_version": self.get_current_version()
        }
