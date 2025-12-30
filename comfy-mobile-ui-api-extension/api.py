"""
ComfyUI Mobile UI API Extension - Main API Router
Complete API system with modular handlers for:
- Workflow management
- File operations  
- Model management
- Download operations
- LoRA trigger words
- Workflow snapshots
- Browser data backup
- System control
"""

from aiohttp import web
import os
import sys

# Import all handlers
try:
    from .handlers.workflow_handler import *
    from .handlers.file_handler import *
    from .handlers.model_handler import *
    from .handlers.download_handler import *
    from .handlers.lora_handler import *
    from .handlers.snapshot_handler import *
    from .handlers.backup_handler import *
    from .handlers.system_handler import *
    from .handlers.widget_handler import *
    from .handlers.node_mapping_handler import *
    from .handlers.manager_handler import *
    from .handlers.video_download_handler import *
    from .handlers.chain_handler import *
    from .handlers.chain_progress_handler import *
    from .handlers.global_websocket_handler import *
    from .utils.global_websocket_manager import global_websocket_manager
except ImportError as e:
    print(f"Warning: Could not import handlers: {e}")
    # Fallback imports (for development/testing)
    from handlers.workflow_handler import *
    from handlers.file_handler import *
    from handlers.model_handler import *
    from handlers.download_handler import *
    from handlers.lora_handler import *
    from handlers.snapshot_handler import *
    from handlers.backup_handler import *
    from handlers.system_handler import *
    from handlers.widget_handler import *
    from handlers.node_mapping_handler import *
    from handlers.manager_handler import *
    from handlers.video_download_handler import *
    from handlers.chain_handler import *
    from handlers.chain_progress_handler import *
    from handlers.global_websocket_handler import *
    from utils.global_websocket_manager import global_websocket_manager

def get_routes():
    """Get routes from ComfyUI server module"""
    try:
        # Try importing from folder_paths first
        import folder_paths
        if hasattr(folder_paths, 'get_routes'):
            return folder_paths.get_routes()
        
        # Fallback to server module
        import server
        if hasattr(server, 'routes'):
            return server.routes
        elif hasattr(server, 'PromptServer') and hasattr(server.PromptServer, 'routes'):
            return server.PromptServer.routes
        
        return None
    except ImportError:
        return None

routes = get_routes()

def setup_routes():
    """Setup API routes - called from __init__.py"""
    try:
        print("ComfyMobileUI API: Setting up routes...")
        
        # Initialize Global WebSocket Manager (Hook into ComfyUI)
        global_websocket_manager.hook_comfyui_server()
        
        # Try to get the server instance and add routes
        import server
        
        # Method 1: Try PromptServer instance
        if hasattr(server, 'PromptServer'):
            prompt_server = server.PromptServer.instance
            if prompt_server and hasattr(prompt_server, 'app'):
                app = prompt_server.app
                
                # Global WebSocket route
                app.router.add_get('/comfymobile/ws', global_websocket_handler)
                
                # System routes
                app.router.add_get('/comfymobile/api/status', api_status)
                app.router.add_post('/comfymobile/api/reboot', reboot_server)
                
                # Workflow routes
                app.router.add_get('/comfymobile/api/workflows/list', list_workflows)
                app.router.add_get('/comfymobile/api/workflows/content/{filename}', get_workflow_content)
                app.router.add_post('/comfymobile/api/workflows/save', save_workflow)
                app.router.add_post('/comfymobile/api/workflows/upload', upload_workflow)
                
                # File management routes
                app.router.add_get('/comfymobile/api/files/list', list_all_files)
                app.router.add_get('/comfymobile/api/files/list/{folder_type}', list_files_by_type)
                app.router.add_delete('/comfymobile/api/files/delete', delete_files)
                app.router.add_post('/comfymobile/api/files/move', move_files)
                app.router.add_post('/comfymobile/api/files/copy', copy_files)
                
                # Model management routes
                app.router.add_get('/comfymobile/api/models/folders', list_model_folders)
                app.router.add_get('/comfymobile/api/models/all', list_all_models)
                app.router.add_get('/comfymobile/api/models/{folder_name}', list_models_in_folder)
                app.router.add_get('/comfymobile/api/models/search', search_models)
                app.router.add_post('/comfymobile/api/models/check-exists', check_file_exists)
                app.router.add_post('/comfymobile/api/models/upload', upload_model_file)
                app.router.add_get('/comfymobile/api/models/uploads/partial', list_partial_uploads)
                app.router.add_delete('/comfymobile/api/models/uploads/partial', delete_partial_upload)
                app.router.add_post('/comfymobile/api/models/move', move_model_file)
                app.router.add_post('/comfymobile/api/models/copy', copy_model_file)
                app.router.add_post('/comfymobile/api/models/delete', delete_model_file)
                app.router.add_post('/comfymobile/api/models/rename', rename_model_file)
                
                # Model download routes
                app.router.add_post('/comfymobile/api/models/download', download_model_file)
                app.router.add_delete('/comfymobile/api/models/downloads/{task_id}', cancel_download)
                app.router.add_delete('/comfymobile/api/models/downloads', clear_download_history)
                app.router.add_get('/comfymobile/api/models/downloads', list_downloads)
                app.router.add_post('/comfymobile/api/models/downloads/{task_id}/resume', resume_download)
                app.router.add_post('/comfymobile/api/models/downloads/retry-all', retry_all_failed_downloads)
                
                # LoRA routes
                app.router.add_get('/comfymobile/api/models/loras', list_loras)
                app.router.add_get('/comfymobile/api/loras/trigger-words', get_lora_trigger_words)
                app.router.add_get('/comfymobile/api/loras/trigger-words/{lora_name}', get_lora_trigger_words_single)
                app.router.add_post('/comfymobile/api/loras/trigger-words', set_lora_trigger_words)
                app.router.add_delete('/comfymobile/api/loras/trigger-words/{lora_name}', delete_lora_trigger_words)
                app.router.add_post('/comfymobile/api/loras/trigger-words/batch', batch_update_trigger_words)
                
                # Workflow Snapshot routes
                app.router.add_post('/comfymobile/api/snapshots', save_workflow_snapshot)
                app.router.add_get('/comfymobile/api/snapshots/{filename}', load_workflow_snapshot)
                app.router.add_get('/comfymobile/api/snapshots', list_all_snapshots)
                app.router.add_get('/comfymobile/api/snapshots/workflow/{workflow_id}', list_snapshots_by_workflow)
                app.router.add_delete('/comfymobile/api/snapshots/{filename}', delete_workflow_snapshot)
                app.router.add_put('/comfymobile/api/snapshots/{filename}/rename', rename_workflow_snapshot)
                
                # Browser Data Backup routes
                app.router.add_get('/comfymobile/api/backup/status', get_backup_status)
                app.router.add_post('/comfymobile/api/backup', create_browser_data_backup)
                app.router.add_post('/comfymobile/api/backup/restore', restore_browser_data_backup)
                
                # Widget Type Management routes
                app.router.add_get('/comfymobile/api/custom/widgets', get_all_widget_types)
                app.router.add_get('/comfymobile/api/custom/widgets/{id}', get_widget_type)
                app.router.add_post('/comfymobile/api/custom/widgets', create_widget_type)
                app.router.add_put('/comfymobile/api/custom/widgets/{id}', update_widget_type)
                app.router.add_delete('/comfymobile/api/custom/widgets/{id}', delete_widget_type)
                
                # Node Input Mapping routes
                app.router.add_get('/comfymobile/api/custom/node-mappings', get_all_node_mappings)
                app.router.add_post('/comfymobile/api/custom/node-mappings', save_node_mapping)
                app.router.add_get('/comfymobile/api/custom/node-mappings/{nodeType}', get_node_mapping)
                app.router.add_delete('/comfymobile/api/custom/node-mappings/{nodeType}', delete_node_mapping)
                app.router.add_post('/comfymobile/api/custom/node-mappings/delete', delete_node_mapping)  # Scope-based deletion

                # Manager proxy routes
                app.router.add_get('/comfymobile/api/manager/queue/start', manager_queue_start)
                app.router.add_post('/comfymobile/api/manager/queue/install', manager_queue_install)

                # Video download routes
                app.router.add_post('/comfymobile/api/videos/download', download_youtube_video)
                app.router.add_get('/comfymobile/api/videos/download/status', get_video_download_status)
                app.router.add_post('/comfymobile/api/logs/subscribe', subscribe_to_logs)
                app.router.add_post('/comfymobile/api/videos/upgrade-yt-dlp', upgrade_yt_dlp)

                # Workflow Chain routes
                app.router.add_get('/comfymobile/api/chains/list', list_workflow_chains)
                app.router.add_get('/comfymobile/api/chains/content/{chain_id}', get_chain_content)
                app.router.add_get('/comfymobile/api/chains/summary/{chain_id}', get_chain_summary_api)
                app.router.add_post('/comfymobile/api/chains/save', save_workflow_chain)
                app.router.add_delete('/comfymobile/api/chains/delete', delete_workflow_chain)
                app.router.add_post('/comfymobile/api/chains/execute', execute_chain_api)
                app.router.add_post('/comfymobile/api/chains/interrupt', interrupt_chain_api)
                app.router.add_get('/comfymobile/api/chains/progress', chain_progress_websocket)
                app.router.add_post('/comfymobile/api/chains/thumbnails', save_chain_thumbnail_api)
                app.router.add_get('/comfymobile/api/chains/thumbnails/{chain_id}/{node_filename}', get_chain_thumbnail_api)

                print("✅ ComfyMobileUI API routes registered successfully")
                print("📋 Modular handlers loaded:")
                print("   🌐  Global WebSocket - consolidated event stream")
                print("   🗂️  System Handler - status, reboot")
                print("   📄  Workflow Handler - workflow CRUD operations")
                print("   📁  File Handler - file management operations")
                print("   🤖  Model Handler - AI model management")
                print("   ⬇️  Download Handler - model downloads")
                print("   🔧  LoRA Handler - trigger word management")
                print("   📸  Snapshot Handler - workflow snapshots")
                print("   💾  Backup Handler - browser data backup/restore")
                print("   🧩  Widget Handler - custom widget type management")
                print("   🔗  Node Mapping Handler - node input mappings")
                print("   🎥  Video Download Handler - YouTube video downloads")
                print("   ⛓️  Chain Handler - workflow chain management")
                return True
        
        # Method 2: Try direct routes access (older versions)
        if routes is not None:
            # Global WebSocket route
            routes.get('/comfymobile/ws')(global_websocket_handler)

            # System routes
            routes.get('/comfymobile/api/status')(api_status)
            routes.post('/comfymobile/api/reboot')(reboot_server)
            
            # Basic workflow routes for compatibility
            routes.get('/comfymobile/api/workflows/list')(list_workflows)
            routes.get('/comfymobile/api/workflows/content/{filename}')(get_workflow_content)
            routes.post('/comfymobile/api/workflows/save')(save_workflow)
            routes.post('/comfymobile/api/workflows/upload')(upload_workflow)
            
            # Basic file routes
            routes.get('/comfymobile/api/files/list')(list_all_files)
            routes.get('/comfymobile/api/files/list/{folder_type}')(list_files_by_type)
            
            # Widget type routes
            routes.get('/comfymobile/api/custom/widgets')(get_all_widget_types)
            routes.get('/comfymobile/api/custom/widgets/{id}')(get_widget_type)
            routes.post('/comfymobile/api/custom/widgets')(create_widget_type)
            routes.put('/comfymobile/api/custom/widgets/{id}')(update_widget_type)
            routes.delete('/comfymobile/api/custom/widgets/{id}')(delete_widget_type)
            
            # Node input mapping routes
            routes.get('/comfymobile/api/custom/node-mappings')(get_all_node_mappings)
            routes.post('/comfymobile/api/custom/node-mappings')(save_node_mapping)
            routes.get('/comfymobile/api/custom/node-mappings/{nodeType}')(get_node_mapping)
            routes.delete('/comfymobile/api/custom/node-mappings/{nodeType}')(delete_node_mapping)

            # Manager proxy routes
            routes.get('/comfymobile/api/manager/queue/start')(manager_queue_start)
            routes.post('/comfymobile/api/manager/queue/install')(manager_queue_install)
            
            print("✅ ComfyMobileUI API routes registered via direct routes (legacy mode)")
            return True
        
        # Method 3: Try to find app in server module
        for attr_name in dir(server):
            attr = getattr(server, attr_name)
            if hasattr(attr, 'router') and hasattr(attr.router, 'add_get'):
                # Basic routes only for unknown server configurations
                attr.router.add_get('/comfymobile/ws', global_websocket_handler)
                attr.router.add_get('/comfymobile/api/status', api_status)
                attr.router.add_get('/comfymobile/api/workflows/list', list_workflows)
                attr.router.add_post('/comfymobile/api/reboot', reboot_server)
                
                print(f"✅ ComfyMobileUI API routes registered via {attr_name} (minimal mode)")
                return True
        
        print("❌ ComfyMobileUI API: Could not find compatible route registration method")
        print("   Extension loaded but API endpoints may not be available")
        return False
        
    except Exception as e:
        print(f"❌ ComfyMobileUI API setup failed: {e}")
        print("   Extension loaded but API endpoints are not available")
        return False
        
    except Exception as e:
        print(f"❌ ComfyMobileUI API setup failed: {e}")
        print("   Extension loaded but API endpoints are not available")
        return False
