#!/usr/bin/env python3
"""
Enhanced ComfyUI External Watchdog with API Server
Provides an API server for external access
"""

import os
import sys
from pathlib import Path

# Add current directory to sys.path to allow importing sibling modules
# This must be done BEFORE importing update_service
current_dir = Path(__file__).parent
if str(current_dir) not in sys.path:
    sys.path.insert(0, str(current_dir))

import time
import subprocess
import psutil
import requests
import shutil
import signal
import json
import argparse
import threading
from typing import Optional, Dict, Any
from datetime import datetime
from update_service import UpdateService

# Simple HTTP server (minimal external dependencies)
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import socketserver
import ssl
import socket


class LauncherAPIHandler(BaseHTTPRequestHandler):
    """Launcher API and Static File request handler"""
    
    def do_GET(self):
        """GET request handler for API and Static files"""
        parsed_url = urlparse(self.path)
        path = parsed_url.path
        
        # 1. API Endpoints (New & Legacy Aliases)
        if path in ['/api/status', '/status']:
            self.send_json_response(self.server.launcher.get_api_status())
            
        elif path in ['/api/logs', '/logs']:
            self.send_json_response(self.server.launcher.get_recent_logs())
            
        elif path == '/api/ping':
            self.send_json_response({"status": "pong", "timestamp": datetime.now().isoformat()})

        elif path == '/api/update/check':
            self.send_json_response(self.server.launcher.update_service.check_for_update())

        elif path == '/api/update/status':
            self.send_json_response(self.server.launcher.update_service.get_update_status())

        elif path == '/':
            # If index.html exists, serve it, otherwise return service info (legacy behavior)
            web_dir = Path(__file__).resolve().parent / "web"
            index_path = web_dir / "index.html"
            
            if index_path.exists():
                self.serve_static_file(path)
            else:
                # Provide more diagnostic info if index.html is missing
                current_version = "unknown"
                try:
                    current_version = self.server.launcher.update_service.get_current_version()
                except:
                    pass
                    
                self.send_json_response({
                    "service": "ComfyUI Mobile UI Launcher",
                    "status": "ready",
                    "web_ui": "not_found",
                    "version": current_version,
                    "tried_path": str(index_path),
                    "timestamp": datetime.now().isoformat(),
                    "instructions": "If you are see this, the 'web' directory might be missing or misplaced. Ensure the 'web' folder exists next to launcher_service.py"
                })

        # 2. Static File Hosting
        else:
            self.serve_static_file(path)
    
    def do_POST(self):
        """POST request handler for API commands"""
        path = urlparse(self.path).path
        content_length = int(self.headers.get('Content-Length', 0))
        
        if content_length > 0:
            try:
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode())
            except:
                data = {}
        else:
            data = {}
        
        if path in ['/api/restart', '/restart']:
            # Manual restart request
            client_ip = self.client_address[0]
            self.server.launcher.log(f"Restart API called from {client_ip}", 'api')
            
            try:
                result = self.server.launcher.manual_restart()
                self.send_json_response({
                    "success": result,
                    "message": "Restart sequence completed" if result else "Restart sequence failed",
                    "timestamp": datetime.now().isoformat()
                })
            except Exception as e:
                self.server.launcher.log(f"Exception in restart API: {e}", 'error')
                self.send_json_response({"success": False, "error": str(e)}, status=500)
            
        elif path in ['/api/shutdown', '/shutdown']:
            # Graceful shutdown request
            self.send_json_response({"success": True, "message": "Launcher shutdown requested"})
            
            def delayed_shutdown():
                time.sleep(1)
                self.server.launcher.log("[API] Shutdown requested via API")
                self.server.launcher.shutdown()
            
            threading.Thread(target=delayed_shutdown, daemon=True).start()
            
        elif path == '/api/update/download':
            # Start update download
            asset_url = data.get('asset_url')
            expected_hash = data.get('sha256') # Optional hash for integrity check
            
            if not asset_url:
                self.send_json_response({"success": False, "error": "Missing asset_url"}, status=400)
                return
            
            success = self.server.launcher.update_service.start_download(asset_url, expected_hash)
            self.send_json_response({
                "success": success,
                "message": "Download started" if success else "Download already in progress"
            })

        else:
            self.send_error(404, "Not Found")
    
    def do_OPTIONS(self):
        """CORS preflight request handler"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization')
        self.end_headers()

    def send_json_response(self, data: Any, status: int = 200):
        """Helper to send JSON responses"""
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def serve_static_file(self, path: str):
        """Serve files from the 'web' directory"""
        import mimetypes
        web_dir = Path(__file__).resolve().parent / "web"
        
        # Default to index.html for root or missing files (SPA support)
        pure_path = path.lstrip('/')
        if pure_path == '' or pure_path == 'index.html':
            file_path = web_dir / "index.html"
        else:
            file_path = web_dir / pure_path

        # If not found, try index.html for SPA routing
        if not file_path.exists():
            file_path = web_dir / "index.html"

        if not file_path.exists() or not file_path.is_file():
            self.send_error(404, "File Not Found")
            return

        content_type, _ = mimetypes.guess_type(str(file_path))
        if not content_type:
            content_type = 'application/octet-stream'

        try:
            with open(file_path, 'rb') as f:
                content = f.read()
                self.send_response(200)
                self.send_header('Content-type', content_type)
                self.send_header('Content-Length', len(content))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Internal Server Error: {e}")

    def log_message(self, format, *args):
        """Suppress default logger to use custom launcher logger"""
        pass


class ThreadedHTTPServer(socketserver.ThreadingMixIn, HTTPServer):
    """Multi-threaded HTTP server"""
    allow_reuse_address = True


class DualProtocolServer(ThreadedHTTPServer):
    """
    Subclass of ThreadedHTTPServer that automatically detects 
    if an incoming connection is HTTP or HTTPS (TLS).
    """
    
    def __init__(self, server_address, RequestHandlerClass, ssl_context=None):
        super().__init__(server_address, RequestHandlerClass)
        self.ssl_context = ssl_context
        self.launcher = None

    def get_request(self):
        """
        Peek at the first byte of the request to detect TLS handshake.
        If it's TLS (0x16), wrap the socket with SSL.
        """
        newsock, fromaddr = self.socket.accept()
        
        if self.ssl_context is None:
            return newsock, fromaddr
            
        try:
            # Peek at the first 6 bytes (TLS record header)
            # 0x16 is the "Handshake" record type
            peek_bytes = newsock.recv(6, socket.MSG_PEEK)
            
            if len(peek_bytes) > 0 and peek_bytes[0] == 0x16:
                # This is a TLS handshake
                try:
                    ssl_sock = self.ssl_context.wrap_socket(newsock, server_side=True)
                    return ssl_sock, fromaddr
                except Exception as ssl_err:
                    # If TLS handshake fails, log it but don't crash
                    pass
            
            # Not TLS or handshake failed, treat as plain HTTP
            return newsock, fromaddr
            
        except Exception:
            # Fallback to plain socket on any error
            return newsock, fromaddr


class EnhancedExternalComfyUILauncher:
    """
    Enhanced ComfyUI External Launcher with Static File Server
    """
    
    def __init__(self, api_port: int):
        # Initialize log system first
        self.log_file = Path(__file__).parent / "watchdog.log"
        self.log_buffer = []
        self.max_log_buffer = 200
        self.log_stats = {
            'info': 0, 'warning': 0, 'error': 0, 'success': 0, 'debug': 0
        }
        
        # comfyui_original_args.json from ComfyUI settings load
        original_args_file = Path(__file__).parent / "comfyui_original_args.json"
        
        if not original_args_file.exists():
            self.log(f"ComfyUI original args file not found: {original_args_file}", 'error')
            time.sleep(0.1)  # Ensure log is written
            sys.exit(1)
        
        try:
            with open(original_args_file, 'r', encoding='utf-8') as f:
                config_data = json.load(f)
        except Exception as e:
            self.log(f"Failed to load ComfyUI original args file: {e}", 'error')
            time.sleep(0.1)  # Ensure log is written
            sys.exit(1)
        
        # Check required fields
        if 'args' not in config_data:
            self.log("Missing 'args' field in ComfyUI original args file", 'error')
            time.sleep(0.1)  # Ensure log is written
            sys.exit(1)
            
        if 'comfyui_script' not in config_data:
            self.log("Missing 'comfyui_script' field in ComfyUI original args file", 'error')
            time.sleep(0.1)  # Ensure log is written
            sys.exit(1)
            
        if 'comfyui_port' not in config_data:
            self.log("Missing 'comfyui_port' field in ComfyUI original args file", 'error')
            time.sleep(0.1)  # Ensure log is written
            sys.exit(1)
        
        # ComfyUI settings extraction
        launch_args = config_data.get('args', [])
        comfyui_script = config_data.get('comfyui_script', 'main.py')
        self.comfyui_port = config_data.get('comfyui_port', 8188)
        self.comfyui_args = [comfyui_script] + launch_args
        self.original_cwd = config_data.get('cwd') # Capture original working directory
        
        # TLS / SSL Settings detection
        self.tls_keyfile = None
        self.tls_certfile = None
        
        # Scan launch_args for TLS certificates
        for i, arg in enumerate(launch_args):
            if arg == '--tls-keyfile' and i + 1 < len(launch_args):
                self.tls_keyfile = launch_args[i + 1]
            elif arg == '--tls-certfile' and i + 1 < len(launch_args):
                self.tls_certfile = launch_args[i + 1]
            elif arg.startswith('--tls-keyfile='):
                self.tls_keyfile = arg.split('=', 1)[1]
            elif arg.startswith('--tls-certfile='):
                self.tls_certfile = arg.split('=', 1)[1]

        if self.tls_keyfile and self.tls_certfile:
            self.log(f"Detected TLS configuration: key={self.tls_keyfile}, cert={self.tls_certfile}", 'info')
        
        # Use the Python executable that was originally used to start ComfyUI
        # This is the most reliable way to ensure we use the same environment
        self.python_executable = sys.executable
        
        # Use detector result only if we need more information or if specifically running standalone
        try:
            import comfyui_detector
            self.comfyui_dir = comfyui_detector.detect_comfyui_path()
            
            # Use original_cwd if available, otherwise use comfyui_dir as fallback for cwd
            self.working_directory = self.original_cwd or self.comfyui_dir
            
            # Resolve the main script to an absolute path for reliability
            # This handles cases where main.py is in a subdirectory (like Portable versions)
            potential_script = Path(self.comfyui_dir) / comfyui_script
            if potential_script.exists():
                self.comfyui_args = [str(potential_script)] + launch_args
                self.log(f"Resolved main script to absolute path: {potential_script}", 'debug')
            else:
                # Fallback to original behavior if file not found in comfyui_dir
                self.comfyui_args = [comfyui_script] + launch_args
            
            # Only switch Python if current one is not detected properly OR if it's a known generic python
            # In Portable versions, sys.executable points to the correct embedded python
            detected_python = comfyui_detector.detect_python_executable()
            
            # We trust the currently running Python more than the detector's guess 
            # unless current Python looks like a system-wide generic one
            is_generic_python = 'python.exe' in self.python_executable.lower() and \
                               'windowsapps' in self.python_executable.lower()
            
            if is_generic_python and detected_python != self.python_executable:
                self.log(f"Switching from generic Python to detected: {detected_python}", 'info')
                self.python_executable = detected_python
            else:
                self.log(f"Using current Python environment: {self.python_executable}", 'debug')
                
            self.log(f"Using ComfyUI backend directory: {self.comfyui_dir}", 'info')
        except Exception as e:
            self.log(f"Failed to process environment detection: {e}", 'error')
        
        # Check ComfyUI directory exists
        if not Path(self.comfyui_dir).exists():
            self.log(f"ComfyUI directory does not exist: {self.comfyui_dir}", 'error')
            time.sleep(0.1)  # Ensure log is written
            sys.exit(1)
            
        # Check main.py exists
        if not (Path(self.comfyui_dir) / comfyui_script).exists():
            self.log(f"ComfyUI script does not exist: {Path(self.comfyui_dir) / comfyui_script}", 'error')
            time.sleep(0.1)  # Ensure log is written
            sys.exit(1)
        
        self.check_interval = 30
        self.initial_check_interval = 5  # Fast check interval during initial startup

        # API server configuration
        self.api_enabled = True
        self.api_port = api_port
        self.api_host = '0.0.0.0'

        # Runtime state
        self.comfyui_process: Optional[subprocess.Popen] = None
        self.is_running = True
        self.api_server: Optional[ThreadedHTTPServer] = None
        self.api_thread: Optional[threading.Thread] = None
        
        # Initialization complete
        self.log("Enhanced External Launcher initialized", 'success')
        self.log(f"ComfyUI Directory: {self.comfyui_dir}", 'info')
        self.log(f"Working Directory: {self.working_directory}", 'info')
        
        # Initialize update service
        self.update_service = UpdateService(self.log)
        self.log(f"Update Service initialized (Current version: {self.update_service.get_current_version()})", 'success')

        # Copy version.json to web directory for frontend access
        try:
            root_dir = Path(__file__).resolve().parent
            version_src = root_dir / "version.json"
            web_dir = root_dir / "web"
            if version_src.exists() and web_dir.exists():
                shutil.copy2(version_src, web_dir / "version.json")
                self.log(f"Deployed version.json to web directory: {web_dir / 'version.json'}", 'debug')
            elif not web_dir.exists():
                self.log(f"Web directory not found at {web_dir}, skipping version.json deployment", 'warning')
        except Exception as e:
            self.log(f"Failed to copy version.json to web directory: {e}", 'warning')

        self.console_thread = threading.Thread(target=self._console_input_loop, daemon=True)
        self.log(f"ComfyUI Port: {self.comfyui_port}", 'info')
        self.log(f"ComfyUI Args: {' '.join(self.comfyui_args)}", 'info')
        self.log(f"Launcher Address: http://{self.api_host}:{self.api_port}", 'info')
        self.log(f"Check Interval: {self.check_interval}s", 'info')
    
    def log(self, message: str, level: str = 'info'):
        """Log message output and storage"""
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        iso_timestamp = datetime.now().isoformat()
        
        # Log level prefix
        level_prefixes = {
            'info': 'INFO',
            'warning': 'WARN',
            'error': 'ERROR',
            'success': 'SUCCESS',
            'debug': 'DEBUG',
            'api': 'API',
            'restart': 'RESTART'
        }
        
        level_prefix = level_prefixes.get(level, 'INFO')
        log_message = f"[{timestamp}] [{level_prefix}] {message}"
        print(log_message)
        
        # Update statistics
        if level in self.log_stats:
            self.log_stats[level] += 1
        else:
            self.log_stats['info'] += 1
        
        # Add to buffer (structured format)
        log_entry = {
            "timestamp": timestamp,
            "iso_timestamp": iso_timestamp,
            "level": level,
            "message": message,
            "full_message": log_message
        }
        self.log_buffer.append(log_entry)
        
        # Buffer size limit
        if len(self.log_buffer) > self.max_log_buffer:
            self.log_buffer.pop(0)
        
        # Save to file (continue even if failed)
        try:
            with open(self.log_file, 'a', encoding='utf-8') as f:
                f.write(log_message + '\n')
                f.flush() 
        except Exception as e:
            error_msg = f"[{timestamp}] [ERROR] Failed to write log: {e}"
            print(error_msg)

    def _get_local_ips(self) -> list:
        """Get all local IP addresses for display"""
        ips = ["127.0.0.1", "localhost"]
        try:
            # Try to get the primary interface IP
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            try:
                # doesn't even have to be reachable
                s.connect(('10.255.255.255', 1))
                primary_ip = s.getsockname()[0]
                if primary_ip not in ips:
                    ips.append(primary_ip)
            except Exception:
                pass
            finally:
                s.close()
            
            # Additional check for all interfaces (optional, but good for completeness)
            hostname = socket.gethostname()
            for ip in socket.gethostbyname_ex(hostname)[2]:
                if ip not in ips and not ip.startswith("127."):
                    ips.append(ip)
        except Exception:
            pass
        return ips
    
    def start_api_server(self) -> bool:
        """API server start"""
        if not self.api_enabled:
            return True
        
        try:
            bind_host = self.api_host
            if bind_host == '0.0.0.0':
                if os.name == 'nt':
                    bind_host = ''
            
            self.log(f"[API] Attempting to bind to {self.api_host}:{self.api_port}")
            
            # Prepare SSL Context if certificates exist
            ssl_context = None
            if self.tls_keyfile and self.tls_certfile:
                try:
                    key_path = Path(self.tls_keyfile)
                    cert_path = Path(self.tls_certfile)
                    
                    if key_path.exists() and cert_path.exists():
                        ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
                        ssl_context.load_cert_chain(certfile=str(cert_path), keyfile=str(key_path))
                        self.log("[SERVER] SSL logic initialized for Dual-Protocol support", 'success')
                    else:
                        self.log(f"[WARN] TLS files not found at specified paths. Falling back to HTTP only.", 'warning')
                except Exception as e:
                    self.log(f"[ERROR] Failed to initialize SSL context: {e}. Falling back to HTTP only.", 'error')

            self.api_server = DualProtocolServer(
                (bind_host, self.api_port), 
                LauncherAPIHandler,
                ssl_context=ssl_context
            )
            
            # Check binding address
            actual_host, actual_port = self.api_server.server_address
            if actual_host == '':
                actual_host = '0.0.0.0'
            
            self.api_server.launcher = self
            
            self.api_thread = threading.Thread(
                target=self.api_server.serve_forever,
                daemon=True,
                name="LauncherServer"
            )
            self.api_thread.start()
            
            protocol_desc = "Dual HTTP/HTTPS" if ssl_context else "HTTP"
            self.log(f"[SERVER] Launcher server ({protocol_desc}) successfully bound to {actual_host}:{actual_port}")
            
            # Print Pretty URL List
            is_dual = ssl_context is not None
            self.log("-----------------------------------------", 'info')
            self.log("🚀 ComfyUI Mobile API is ready!", 'success')
            
            GREEN = "\033[1;32m"
            RESET = "\033[0m"
            BOLD = "\033[1m"
            CYAN = "\033[36m"
            
            local_ips = self._get_local_ips()
            
            # Categorize IPs
            locals_list = [ip for ip in local_ips if ip in ["127.0.0.1", "localhost"]]
            networks_list = [ip for ip in local_ips if ip not in ["127.0.0.1", "localhost"]]
            
            # Helper to print a group
            def print_url_group(is_https: bool):
                protocol = "https" if is_https else "http"
                suffix = " (HTTPS)" if is_https else ""
                
                # Local
                for ip in locals_list:
                    label = f"Local{suffix}"
                    self.log(f"  {GREEN}➜{RESET}  {BOLD}{label:<15}:{RESET} {CYAN}{protocol}://{ip}:{self.api_port}/{RESET}", 'info')
                
                # Networks
                for i, ip in enumerate(networks_list, 1):
                    label = f"Network {i}{suffix}"
                    self.log(f"  {GREEN}➜{RESET}  {BOLD}{label:<15}:{RESET} {CYAN}{protocol}://{ip}:{self.api_port}/{RESET}", 'info')

            # 1. Print HTTP Group
            print_url_group(is_https=False)
            
            # 2. Print HTTPS Group (Only if Dual)
            if is_dual:
                print_url_group(is_https=True)
            
            self.log("-----------------------------------------", 'info')
            
            return True
            
        except Exception as e:
            self.log(f"[ERROR] Failed to start API server: {e}")
            self.log(f"[DEBUG] Attempted bind address: {self.api_host}:{self.api_port}")
            return False
    
    def stop_api_server(self):
        """API server stop"""
        if self.api_server:
            self.log("[STOP] Stopping API server...")
            self.api_server.shutdown()
            self.api_server.server_close()
            
            if self.api_thread:
                self.api_thread.join(timeout=5)
            
            self.log("[SUCCESS] API server stopped")
    
    def get_api_status(self) -> Dict[str, Any]:
        """API status query"""
        status = {
            "launcher": {
                "running": self.is_running,
                "check_interval": self.check_interval,
                "mode": "monitor_only"
            },
            "comfyui": {
                "port": self.comfyui_port,
                "responsive": self.is_comfyui_responsive(),
                "process_running": self.comfyui_process and self.comfyui_process.poll() is None,
                "process_pid": self.comfyui_process.pid if self.comfyui_process else None
            },
            "api": {
                "enabled": self.api_enabled,
                "host": self.api_host,
                "port": self.api_port,
                "version": self.update_service.get_current_version(),
                "protocol": "dual" if (self.tls_keyfile and self.tls_certfile) else "http"
            },
            "timestamp": datetime.now().isoformat()
        }
        # Add watchdog alias for backward compatibility with older UI versions
        status["watchdog"] = status["launcher"]
        return status
    
    def get_recent_logs(self, limit: int = 50) -> Dict[str, Any]:
        """Recent log query"""
        recent_logs = self.log_buffer[-limit:] if limit > 0 else self.log_buffer
        
        return {
            "logs": recent_logs,
            "total_count": len(self.log_buffer),
            "limit": limit,
            "stats": self.log_stats.copy(),
            "log_file": str(self.log_file),
            "buffer_info": {
                "current_size": len(self.log_buffer),
                "max_size": self.max_log_buffer
            },
            "last_updated": datetime.now().isoformat() if self.log_buffer else None
        }
    
    def manual_restart(self) -> bool:
        """Manual restart request"""
        self.log("Manual restart requested via API", 'api')
        
        # Request pre-status logging
        is_responsive = self.is_comfyui_responsive()
        self.log(f"Pre-restart status - ComfyUI responsive: {is_responsive}", 'restart')
        
        try:
            result = self.restart_comfyui()
            if result:
                self.log("Manual restart request completed successfully", 'success')
            else:
                self.log("Manual restart request failed", 'error')
            return result
        except Exception as e:
            self.log(f"Exception during manual restart: {e}", 'error')
            return False
    
    def update_config(self, new_config: Dict[str, Any]) -> bool:
        """Configuration update"""
        try:
            if 'check_interval' in new_config:
                self.check_interval = max(10, int(new_config['check_interval']))
                self.log(f"📝 Check interval updated to {self.check_interval}s")
            
            return True
        except Exception as e:
            self.log(f"[ERROR] Config update failed: {e}")
            return False
    
    def is_comfyui_responsive(self) -> bool:
        """ComfyUI server response check"""
        try:
            protocol = "https" if self.tls_keyfile and self.tls_certfile else "http"
            url = f"{protocol}://localhost:{self.comfyui_port}/"
            
            # Use verify=False for local health check to handle self-signed certs
            # Suppress insecure request warnings for local check
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            
            response = requests.get(
                url,
                timeout=10,
                verify=False
            )
            return response.status_code == 200
        except Exception:
            return False

    def _subscribe_to_logs(self) -> None:
        """Subscribe to ComfyUI logs after server is ready"""
        try:
            # Wait for ComfyUI internal systems to be fully ready
            self.log(f"⏳ Waiting 20 seconds for ComfyUI internal systems to initialize...", 'info')
            time.sleep(20)

            protocol = "https" if self.tls_keyfile and self.tls_certfile else "http"
            url = f"{protocol}://127.0.0.1:{self.comfyui_port}/internal/logs/subscribe"
            client_id = "comfy-mobile-ui-client-2025"

            self.log(f"📋 Subscribing to ComfyUI logs ({protocol}) with clientId: {client_id}", 'info')

            # Suppress insecure request warnings for local loopback
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

            response = requests.patch(
                url,
                json={"enabled": True, "clientId": client_id},
                headers={"Content-Type": "application/json"},
                timeout=10,
                verify=False
            )

            if response.status_code == 200:
                self.log(f"✅ Successfully subscribed to ComfyUI logs", 'success')
            else:
                self.log(f"⚠️ Failed to subscribe to logs: HTTP {response.status_code}", 'warning')

        except Exception as e:
            self.log(f"❌ Error subscribing to logs: {e}", 'error')
    
    def find_comfyui_process(self) -> Optional[psutil.Process]:
        """Find running ComfyUI process"""
        try:
            for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
                try:
                    cmdline = proc.info.get('cmdline', [])
                    if cmdline and any('main.py' in arg for arg in cmdline):
                        # Find ComfyUI process with matching port
                        if any(str(self.comfyui_port) in arg for arg in cmdline):
                            return psutil.Process(proc.info['pid'])
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
        except Exception as e:
            self.log(f"[ERROR] Error finding ComfyUI process: {e}")
        return None
    
    def start_comfyui(self) -> bool:
        """ComfyUI process start"""
        try:
            self.log("[START] Starting ComfyUI process...")
            
            # Current environment variables copy
            env = os.environ.copy()
            
            # ComfyUI start command
            cmd = [self.python_executable] + self.comfyui_args
            
            # Prevent recursive spawn
            if any('watchdog' in str(arg).lower() for arg in self.comfyui_args):
                self.log("[ERROR] WARNING: Detected watchdog script in args - preventing recursive spawn")
                self.log(f"   Problematic args: {self.comfyui_args}")
                return False
            
            self.log(f"   Command: {' '.join(cmd)}")
            self.log(f"   Working Directory: {self.working_directory}")
            
            # Start ComfyUI process in a new process group (for isolation)
            # Redirect stdout/stderr to file to prevent pipe buffer issues
            log_file = Path(__file__).parent / "comfyui_output.log"
            
            if os.name == 'nt':  # Windows
                with open(log_file, 'w', encoding='utf-8') as log_f:
                    self.comfyui_process = subprocess.Popen(
                        cmd,
                        cwd=self.working_directory,
                        env=env,
                        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
                        stdout=log_f,
                        stderr=subprocess.STDOUT  # Merge stderr to stdout
                    )
            else:  # Unix/Linux/Mac
                with open(log_file, 'w', encoding='utf-8') as log_f:
                    self.comfyui_process = subprocess.Popen(
                        cmd,
                        cwd=self.comfyui_dir,
                        env=env,
                        preexec_fn=os.setsid,
                        stdout=log_f,
                        stderr=subprocess.STDOUT  # Merge stderr to stdout
                    )
            
            self.log(f"ComfyUI output will be logged to: {log_file}", 'debug')
            
            self.log(f"[SUCCESS] ComfyUI process started (PID: {self.comfyui_process.pid})")
            return True
            
        except Exception as e:
            self.log(f"[ERROR] Failed to start ComfyUI: {e}")
            return False
    
    def stop_comfyui(self) -> bool:
        """ComfyUI process stop"""
        try:
            if self.comfyui_process:
                if self.comfyui_process.poll() is None:
                    # Process is still running
                    self.log(f"[STOP] Stopping active ComfyUI process (PID: {self.comfyui_process.pid})...")
                    
                    # Attempt graceful termination
                    self.comfyui_process.terminate()
                    
                    # Wait for process to terminate
                    try:
                        self.comfyui_process.wait(timeout=10)
                        self.log("[SUCCESS] ComfyUI process stopped gracefully")
                    except subprocess.TimeoutExpired:
                        # Force kill
                        self.log("[WARN] Force killing ComfyUI process...")
                        self.comfyui_process.kill()
                        self.comfyui_process.wait()
                        self.log("[KILL] ComfyUI process force killed")
                else:
                    # Process was already stopped
                    self.log(f"[STOP] ComfyUI process was already stopped (PID: {self.comfyui_process.pid})")
                
                self.comfyui_process = None
            else:
                # No process to stop
                self.log("[STOP] No ComfyUI process to stop (already stopped or never started)")
            
            # Check for any remaining ComfyUI processes and terminate
            orphaned_process = self.find_comfyui_process()
            if orphaned_process:
                self.log(f"[STOP] Found orphaned ComfyUI process (PID: {orphaned_process.pid}), terminating...")
                try:
                    orphaned_process.terminate()
                    orphaned_process.wait(timeout=5)
                    self.log("[SUCCESS] Orphaned ComfyUI process terminated")
                except:
                    self.log("[WARN] Could not terminate orphaned process")
            
            return True
            
        except Exception as e:
            self.log(f"[ERROR] Error stopping ComfyUI: {e}")
            # Error even though process reference is initialized
            self.comfyui_process = None
            return False
    
    def restart_comfyui(self) -> bool:
        """ComfyUI manual restart (only executed by API request)"""
        restart_start_time = time.time()
        self.log("Manual restart sequence initiated", 'restart')
        
        # Current status check and logging
        current_responsive = self.is_comfyui_responsive()
        self.log(f"Current ComfyUI status - Responsive: {current_responsive}", 'restart')
        
        if self.comfyui_process:
            process_running = self.comfyui_process.poll() is None
            pid = self.comfyui_process.pid if process_running else 'None'
            self.log(f"Current process status - Running: {process_running}, PID: {pid}", 'restart')
        else:
            self.log("No tracked ComfyUI process found", 'restart')
        
        # 1. Existing process stop
        self.log("Step 1/3: Stopping existing ComfyUI process", 'restart')
        stop_start_time = time.time()
        stop_success = self.stop_comfyui()
        stop_duration = time.time() - stop_start_time
        
        if stop_success:
            self.log(f"Process stop completed successfully in {stop_duration:.2f}s", 'success')
        else:
            self.log(f"Process stop had issues but continuing (took {stop_duration:.2f}s)", 'warning')
        
        # 2. Wait time
        self.log("Step 2/3: Waiting for clean shutdown...", 'restart')
        wait_time = 3
        time.sleep(wait_time)
        
        # Execution settings check and logging
        self.log("Step 3/3: Starting new ComfyUI process", 'restart')
        self.log(f"Configuration check:", 'debug')
        self.log(f"  Python: {self.python_executable}", 'debug')
        self.log(f"  ComfyUI Dir: {self.comfyui_dir}", 'debug')
        self.log(f"  Working Dir: {self.working_directory}", 'debug')  
        self.log(f"  Args: {' '.join(map(str, self.comfyui_args))}", 'debug')
        self.log(f"  Port: {self.comfyui_port}", 'debug')
        
        # 3. New process start
        start_time = time.time()
        success = self.start_comfyui()
        start_duration = time.time() - start_time
        
        if success:
            self.log(f"Process start completed in {start_duration:.2f}s", 'success')
            
            # 4. Process status check
            time.sleep(2)  # Ensure process has started
            if self.comfyui_process and self.comfyui_process.poll() is not None:
                # Process has already terminated - error occurred
                self.log(f"ComfyUI process exited immediately with code: {self.comfyui_process.returncode}", 'error')
                
                # Check output log file
                log_file = Path(__file__).parent / "comfyui_output.log"
                try:
                    if log_file.exists():
                        with open(log_file, 'r', encoding='utf-8') as f:
                            output = f.read()
                            if output:
                                # Log last 500 characters
                                self.log(f"ComfyUI output (last 500 chars): {output[-500:]}", 'error')
                            else:
                                self.log("ComfyUI output log is empty", 'error')
                    else:
                        self.log("ComfyUI output log file not found", 'error')
                except Exception as e:
                    self.log(f"Failed to read ComfyUI output log: {e}", 'error')
                    
                return False
            
            # 5. Response check (longer wait)
            self.log("Waiting for ComfyUI to become responsive...", 'restart')
            wait_start = time.time()
            max_wait = 45  # 45 seconds wait (longer)
            
            while time.time() - wait_start < max_wait:
                time.sleep(2)
                
                # Check if process is still running
                if self.comfyui_process and self.comfyui_process.poll() is not None:
                    self.log(f"ComfyUI process died during startup (exit code: {self.comfyui_process.returncode})", 'error')
                    return False
                
                if self.is_comfyui_responsive():
                    response_time = time.time() - wait_start
                    total_time = time.time() - restart_start_time
                    self.log(f"ComfyUI is now responsive! (response in {response_time:.2f}s, total restart {total_time:.2f}s)", 'success')

                    # Log subscription will be handled by monitor_loop automatically

                    return True
                else:
                    elapsed = time.time() - wait_start
                    self.log(f"Still waiting for response... ({elapsed:.1f}s/{max_wait}s)", 'debug')
            
            # No response after 45 seconds
            total_time = time.time() - restart_start_time
            self.log(f"Process started but not responsive after {max_wait}s (total restart time: {total_time:.2f}s)", 'warning')
            
            # Check if process is still running
            if self.comfyui_process and self.comfyui_process.poll() is None:
                self.log("ComfyUI process is still running - may need more time to load", 'info')
                return True  # Process is still running, consider it a success
            else:
                self.log("ComfyUI process has stopped - restart failed", 'error')
                return False
            
        else:
            total_time = time.time() - restart_start_time
            self.log(f"Failed to start new process (total attempt time: {total_time:.2f}s)", 'error')
            return False
    
    def _console_input_loop(self):
        """Console input handler for manual commands"""
        while self.is_running:
            try:
                # Use standard input for command checking
                if sys.stdin.isatty():
                    cmd = input()
                    if cmd.strip().lower() == 'r':
                        self.log("Manual restart triggered from console", 'restart')
                        self.manual_restart()
                else:
                    # Non-interactive mode, just sleep
                    time.sleep(1.0)
            except (EOFError, KeyboardInterrupt):
                break
            except Exception as e:
                # Prevent tight loop on error
                time.sleep(1.0)

    def monitor_loop(self):
        """Main monitoring loop - only status monitoring, no automatic restart"""
        self.log("[LAUNCHER] Enhanced External Launcher monitoring started")

        # Flag to track if we've subscribed to logs on initial startup
        logs_subscribed = False
        # Flag to track if server has been detected as responsive at least once
        server_detected = False

        while self.is_running:
            try:
                # ComfyUI status check only, no automatic restart
                is_responsive = self.is_comfyui_responsive()
                if not is_responsive:
                    # Log only on first detection (spam protection)
                    if not hasattr(self, '_last_down_logged') or not self._last_down_logged:
                        self.log("[MONITOR] ComfyUI is not responsive - waiting for manual restart request")
                        self._last_down_logged = True
                    # Reset subscription flag when server goes down
                    logs_subscribed = False
                    # Reset server detected flag to use fast check interval again
                    server_detected = False
                else:
                    # Log when ComfyUI recovers
                    if hasattr(self, '_last_down_logged') and self._last_down_logged:
                        self.log("[MONITOR] ComfyUI is responsive again")
                        self._last_down_logged = False

                    # Subscribe to logs on initial startup (once per server lifetime)
                    if not logs_subscribed:
                        self._subscribe_to_logs()
                        logs_subscribed = True

                    # Mark server as detected for switching to normal check interval
                    if not server_detected:
                        server_detected = True
                        self.log(f"[MONITOR] Server detected, switching to normal check interval ({self.check_interval}s)")

                # Use faster check interval during initial startup, slower after server is detected
                current_interval = self.initial_check_interval if not server_detected else self.check_interval
                if not server_detected:
                    self.log(f"[MONITOR] Using fast check interval: {current_interval}s (waiting for server)", 'debug')
                time.sleep(current_interval)
                
            except KeyboardInterrupt:
                self.log("[STOP] Launcher interrupted by user")
                break
            except Exception as e:
                self.log(f"[ERROR] Unexpected error in monitor loop: {e}")
                time.sleep(5)
        
        self.log("[LAUNCHER] Enhanced External Launcher monitoring stopped")
    
    def run(self):
        """Run launcher service"""
        try:
            self.log("[LAUNCHER] Starting Enhanced External Launcher", 'success')
            self.log(f"ComfyUI Path: {self.comfyui_dir}", 'info')
            self.log(f"ComfyUI Port: {self.comfyui_port}", 'info')
            self.log(f"Launcher Server Port: {self.api_port}", 'info')
            
            # Start server
            self.start_api_server()
            
            # Start monitoring loop
            self.log("[LAUNCHER] Starting monitoring loop...", 'info')
            self.monitor_loop()
            
        finally:
            # Cleanup
            self.shutdown()

    def shutdown(self):
        """Graceful shutdown"""
        self.is_running = False
        self.stop_api_server()
        self.stop_comfyui()
        self.log("[LAUNCHER] Enhanced External Launcher shutdown complete")


def check_port_in_use(port: int) -> bool:
    """Check if port is already in use"""
    try:
        import socket
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(1)
            result = s.connect_ex(('localhost', port))
            return result == 0
    except:
        return False


def main():
    """Main function - no fallback logic"""
    # Print intro message to terminal
    print("=" * 60)
    print("  ComfyUI Mobile UI Launcher & Web Server")
    print("=" * 60)
    print("This terminal window shows the ComfyUI launcher service.")
    print("It hosts the Mobile UI and monitors ComfyUI for restart functionality.")
    print("Do NOT close this window while using ComfyUI Mobile UI.")
    print("URL: http://localhost:9188")
    print("=" * 60)
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    parser = argparse.ArgumentParser(description='Enhanced ComfyUI External Launcher & Server')
    parser.add_argument('--api-port', type=int, required=True, help='Server port (required)')
    
    args = parser.parse_args()
    
    print(f"[INIT] Launcher Port: {args.api_port}")
    
    # Check if port is already in use
    if check_port_in_use(args.api_port):
        print(f"[ERROR] Port {args.api_port} is already in use. Another launcher may be running.")
        time.sleep(0.1)  # Ensure log is written
        sys.exit(1)
    
    print("[INIT] Starting launcher service...")
    launcher = EnhancedExternalComfyUILauncher(args.api_port)
    launcher.run()


if __name__ == "__main__":
    main()