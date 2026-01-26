import os
import sys
import asyncio
from typing import Dict, List, Any, Optional
from aiohttp import web

# Define route handlers as regular functions (to be registered dynamically)
async def api_status(request):
    """Health check and extension status"""
    import json
    from pathlib import Path
    
    # Try to read version.json directly
    version_info = "0.0.0"
    try:
        # handlers/system_handler.py -> parent -> version.json
        extension_root = Path(__file__).parent.parent
        version_file = extension_root / "version.json"
        
        if version_file.exists():
            with open(version_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                version_info = data.get("version", "0.0.0")
    except Exception as e:
        print(f"Warning: Could not read version.json: {e}")

    # Base response
    response_data = {
        "status": "ok",
        "extension": "ComfyUI Mobile UI API",
        "version": version_info, # Actual package version from version.json
        "endpoints": [
            # Core endpoints
            "GET /comfymobile/api/status",
            "POST /comfymobile/api/reboot",
            
            # Workflow endpoints
            "GET /comfymobile/api/workflows/list", 
            "GET /comfymobile/api/workflows/content/{filename}",
            "POST /comfymobile/api/workflows/save",
            "POST /comfymobile/api/workflows/upload",
            
            # File management endpoints
            "GET /comfymobile/api/files/list",
            "GET /comfymobile/api/files/list/{folder_type}",
            "DELETE /comfymobile/api/files/delete",
            "POST /comfymobile/api/files/move",
            "POST /comfymobile/api/files/copy",
            
            # Model management endpoints
            "GET /comfymobile/api/models/folders",
            "GET /comfymobile/api/models/all",
            "GET /comfymobile/api/models/{folder_name}",
            "GET /comfymobile/api/models/search?q={query}&folder_type={folder}",
            "POST /comfymobile/api/models/move",
            "POST /comfymobile/api/models/copy",
            "POST /comfymobile/api/models/delete",
            "POST /comfymobile/api/models/rename",
            
            # Model download endpoints
            "POST /comfymobile/api/models/download",
            "GET /comfymobile/api/models/downloads",
            "DELETE /comfymobile/api/models/downloads/{task_id}",
            "DELETE /comfymobile/api/models/downloads",
            "POST /comfymobile/api/models/downloads/{task_id}/resume",
            "POST /comfymobile/api/models/downloads/retry-all",
            
            # LoRA endpoints
            "GET /comfymobile/api/models/loras",
            "GET /comfymobile/api/loras/trigger-words",
            "GET /comfymobile/api/loras/trigger-words/{lora_name}",
            "POST /comfymobile/api/loras/trigger-words",
            "DELETE /comfymobile/api/loras/trigger-words/{lora_name}",
            "POST /comfymobile/api/loras/trigger-words/batch",
            
            # Workflow Snapshot endpoints
            "POST /comfymobile/api/snapshots",
            "GET /comfymobile/api/snapshots",
            "GET /comfymobile/api/snapshots/{filename}",
            "GET /comfymobile/api/snapshots/workflow/{workflow_id}",
            "DELETE /comfymobile/api/snapshots/{filename}",
            "PUT /comfymobile/api/snapshots/{filename}/rename",
            
            # Browser Data Backup endpoints
            "GET /comfymobile/api/backup/status",
            "POST /comfymobile/api/backup",
            "POST /comfymobile/api/backup/restore"
        ]
    }
    return web.json_response(response_data)



async def reboot_server(request):
    """Reboot the ComfyUI server by restarting the Python process"""
    try:
        # Optional: Get confirmation from request body
        data = await request.json()
        confirm = data.get('confirm', False)
        
        if not confirm:
            return web.json_response({
                "status": "error",
                "message": "Reboot requires confirmation. Set confirm=true in request body"
            }, status=400)
        
        # Log the reboot request
        print("ComfyMobileUI API: Server reboot requested")
        
        # Send success response before reboot
        response = web.json_response({
            "status": "success",
            "message": "Server is rebooting..."
        })
        
        # Schedule reboot after response is sent
        async def delayed_reboot():
            await asyncio.sleep(0.5)  # Small delay to ensure response is sent
            try:
                # Try to close any open logs
                if hasattr(sys.stdout, 'close_log'):
                    sys.stdout.close_log()
            except Exception:
                pass
            
            # Replace current process with new Python process
            os.execv(sys.executable, [sys.executable] + sys.argv)
        
        # Import asyncio for delayed execution
        import asyncio
        asyncio.create_task(delayed_reboot())
        
        return response
        
    except Exception as e:
        return web.json_response({
            "status": "error",
            "message": f"Failed to initiate reboot: {str(e)}"
        }, status=500)
