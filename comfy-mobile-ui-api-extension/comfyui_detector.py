"""
ComfyUI Environment Detector
Utility to detect ComfyUI environment automatically
"""

import os
import sys
import argparse
from pathlib import Path
from typing import Tuple, Optional


def detect_comfyui_environment() -> Tuple[str, int, str]:
    """
    Detect ComfyUI environment automatically
    
    Returns:
        Tuple[str, int, str]: (ComfyUI path, port, main script)
    """
    # ComfyUI path detection
    comfyui_path = detect_comfyui_path()
    
    # port detection
    comfyui_port = detect_comfyui_port()
    
    # main script detection
    main_script = detect_main_script(comfyui_path)
    
    print(f"[DETECTOR] ComfyUI environment detected:")
    print(f"   path: {comfyui_path}")
    print(f"   port: {comfyui_port}")
    print(f"   script: {main_script}")
    
    return comfyui_path, comfyui_port, main_script


def detect_comfyui_path() -> str:
    """ComfyUI path detection"""
    
    # Method 1: Python script path inference (if currently running inside ComfyUI)
    main_script_path = sys.argv[0] if sys.argv else None
    if main_script_path:
        main_dir = Path(main_script_path).parent
        if (main_dir / "main.py").exists():
            return str(main_dir)

    # Method 2: Custom nodes directory relative detection (High Priority for Extensions)
    # path: custom_nodes/comfy-mobile-ui-api-extension/comfyui_detector.py
    current_file = Path(__file__)
    potential_comfyui = current_file.parent.parent.parent  # ../../ -> ComfyUI Base
    if (potential_comfyui / "main.py").exists():
        return str(potential_comfyui)
    
    # Method 3: Current working directory
    cwd = os.getcwd()
    if (Path(cwd) / "main.py").exists():
        return cwd

    # Method 4: Environment variable
    comfyui_path = os.environ.get('COMFYUI_PATH')
    if comfyui_path and Path(comfyui_path).exists():
        return comfyui_path
    
    # Method 5: Common paths (Last Resort)
    common_paths = [
        Path.home() / "Documents" / "ComfyUI",
        Path("C:\\Users") / os.environ.get('USERNAME', '') / "Documents" / "ComfyUI",
        Path("C:\\ComfyUI"),
        Path("C:\\Users") / os.environ.get('USERNAME', '') / "AppData\\Local\\Programs\\@comfyorgcomfyui-electron\\resources\\ComfyUI"
    ]
    
    for path in common_paths:
        if path.exists() and (path / "main.py").exists():
            print(f"[DETECTOR] ComfyUI found in common paths: {path}")
            return str(path)
    
    # Method 4: Custom nodes directory
    # custom_nodes/comfy-mobile-ui-api-extension/__init__.py
    current_file = Path(__file__)
    potential_comfyui = current_file.parent.parent.parent  # ../../
    if (potential_comfyui / "main.py").exists():
        return str(potential_comfyui)
    
    # Default value: current directory
    print(f"[DETECTOR] ComfyUI path not detected, using default value: {cwd}")
    return cwd


def detect_comfyui_port() -> int:
    """ComfyUI port detection"""
    
    # Method 1: Command line argument parsing
    try:
        # ComfyUI typically uses --port argument
        for i, arg in enumerate(sys.argv):
            if arg in ['--port'] and i + 1 < len(sys.argv):
                try:
                    return int(sys.argv[i + 1])
                except ValueError:
                    pass
            elif arg.startswith('--port='):
                try:
                    return int(arg.split('=')[1])
                except ValueError:
                    pass
    except:
        pass
    
    # Method 2: Environment variable
    port_env = os.environ.get('COMFYUI_PORT')
    if port_env:
        try:
            return int(port_env)
        except ValueError:
            pass
    
    # Method 3: Default port
    return 8188


def detect_main_script(comfyui_path: str) -> str:
    """Main script file detection"""
    
    # Common ComfyUI main scripts
    possible_scripts = ['main.py', 'run.py', 'start.py', 'app.py']
    
    for script in possible_scripts:
        if (Path(comfyui_path) / script).exists():
            return script
    
    # executed script name
    if sys.argv and sys.argv[0]:
        executed_script = Path(sys.argv[0]).name
        if executed_script.endswith('.py'):
            script_path = Path(comfyui_path) / executed_script
            if script_path.exists():
                return executed_script
    
    # Default value
    return 'main.py'


def detect_python_executable() -> str:
    """
    Detect the Python executable used to run ComfyUI
    use base directory .venv first
    """
    # Method 1: base directory .venv
    # base directory is Documents/ComfyUI (user data storage)
    base_directory_candidates = [
        Path.home() / "Documents" / "ComfyUI",
        Path(f"C:\\Users\\{os.environ.get('USERNAME', '')}")  / "Documents" / "ComfyUI"
    ]
    
    for base_dir in base_directory_candidates:
        venv_python = base_dir / ".venv" / "Scripts" / "python.exe"
        if venv_python.exists():
            print(f"[DETECTOR] Found base directory .venv Python: {venv_python}")
            return str(venv_python)
    
    # Method 2: Current Python executable
    current_python = sys.executable
    
    # ComfyUI Desktop app case
    if 'comfyui-electron' in current_python.lower():
        print(f"[DETECTOR] Using ComfyUI Desktop app Python: {current_python}")
        return current_python
        
    # Method 3: ComfyUI directory Python
    comfyui_path = detect_comfyui_path()
    potential_pythons = [
        Path(comfyui_path) / 'python_embeded' / 'python.exe',  # embedded Python
        Path(comfyui_path) / 'python' / 'python.exe',  # embedded Python (another path)
        Path(comfyui_path).parent / 'python_embeded' / 'python.exe',  # parent directory
    ]
    
    for python_path in potential_pythons:
        if python_path.exists():
            print(f"[DETECTOR] Found embedded Python: {python_path}")
            return str(python_path)
    
    # Method 4: System Python
    print(f"[DETECTOR] Using system Python: {current_python}")
    return current_python


def get_comfyui_launch_args() -> list:
    """
    Detect the arguments used to run ComfyUI
    """
    # Filter out arguments related to ComfyUI
    filtered_args = []
    
    skip_next = False
    for i, arg in enumerate(sys.argv):
        if skip_next:
            skip_next = False
            continue
            
        # Python executable and main script are excluded
        if i == 0:  # sys.argv[0] is usually the script name
            continue
            
        # watchdog related arguments are excluded
        if 'watchdog' in arg.lower():
            continue
            
        # ComfyUI related arguments are included
        if arg.startswith('--'):
            filtered_args.append(arg)
            # values are included
            if i + 1 < len(sys.argv) and not sys.argv[i + 1].startswith('-'):
                filtered_args.append(sys.argv[i + 1])
                skip_next = True
        elif not arg.startswith('-') and i > 0 and sys.argv[i-1].startswith('--'):
            # already processed
            pass
        else:
            # other arguments
            filtered_args.append(arg)
    
    return filtered_args


if __name__ == "__main__":
    # test run
    path, port, script = detect_comfyui_environment()
    args = get_comfyui_launch_args()
    print(f"Detected launch arguments: {args}")