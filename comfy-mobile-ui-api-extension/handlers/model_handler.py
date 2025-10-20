

import os
import json
import shutil
import time
from typing import Dict, List, Any, Optional
from aiohttp import web
import folder_paths

# Import the rename_trigger_word_key function from lora_handler
try:
    from .lora_handler import rename_trigger_word_key
except ImportError:
    # Fallback if lora_handler is not available
    def rename_trigger_word_key(old_filename, new_filename):
        return True

async def list_model_folders(request):
    """List all available model folders in ComfyUI models directory"""
    try:
        # Get models directory path
        models_path = os.path.join(folder_paths.base_path, "models")
        
        if not os.path.exists(models_path):
            return web.json_response({
                "success": False,
                "error": "Models directory not found",
                "folders": []
            })
        
        folders = []
        
        # Scan all directories in models folder
        for item in os.listdir(models_path):
            item_path = os.path.join(models_path, item)
            if os.path.isdir(item_path):
                # Get folder info
                folder_info = {
                    "name": item,
                    "path": item,  # Relative path from models/
                    "full_path": item_path,
                    "file_count": 0,
                    "subfolder_count": 0,
                    "has_subfolders": False
                }
                
                # Count all files recursively including subfolders
                try:
                    file_count = 0
                    subfolder_count = 0
                    
                    for root, dirs, files in os.walk(item_path):
                        # Count files (excluding hidden files and .json files)
                        valid_files = [f for f in files 
                                     if not f.startswith('.') and not f.startswith('__') and not f.lower().endswith('.json')]
                        file_count += len(valid_files)
                        
                        # Count subfolders (only immediate subfolders for the main directory)
                        if root == item_path:
                            subfolder_count = len([d for d in dirs 
                                                 if not d.startswith('.') and not d.startswith('__')])
                    
                    folder_info["file_count"] = file_count
                    folder_info["subfolder_count"] = subfolder_count
                    folder_info["has_subfolders"] = subfolder_count > 0
                    
                except (PermissionError, OSError):
                    folder_info["file_count"] = 0
                    folder_info["subfolder_count"] = 0
                    folder_info["has_subfolders"] = False
                
                folders.append(folder_info)
        
        # Sort folders alphabetically
        folders.sort(key=lambda x: x["name"].lower())
        
        return web.json_response({
            "success": True,
            "folders": folders,
            "total_folders": len(folders),
            "models_path": models_path
        })
        
    except Exception as e:
        return web.json_response({
            "success": False,
            "error": f"Failed to list model folders: {str(e)}",
            "folders": []
        }, status=500)


async def list_all_models(request):
    """List all model files recursively from all model folders"""
    try:
        # Get models directory path
        models_path = os.path.join(folder_paths.base_path, "models")
        
        if not os.path.exists(models_path):
            return web.json_response({
                "success": False,
                "error": "Models directory not found",
                "models": []
            })
        
        all_models = []
        
        # Recursively scan all directories in models folder
        for root, dirs, files in os.walk(models_path):
            # Skip hidden directories
            dirs[:] = [d for d in dirs if not d.startswith('.') and not d.startswith('__')]
            
            # Calculate relative path from models directory
            rel_path = os.path.relpath(root, models_path)
            folder_type = rel_path.split(os.sep)[0] if rel_path != "." else "root"
            subfolder = os.path.relpath(root, os.path.join(models_path, folder_type)).replace(os.sep, "/") if rel_path != "." else ""
            if subfolder == ".":
                subfolder = ""
            
            for filename in files:
                if filename.startswith('.') or filename.startswith('__'):
                    continue
                
                # Skip .json files (ComfyUI auto-generated files)
                if filename.lower().endswith('.json'):
                    continue
                
                # Get file extension
                file_ext = os.path.splitext(filename)[1].lower()
                
                file_path = os.path.join(root, filename)
                
                # Get file info
                try:
                    stat_info = os.stat(file_path)
                    file_size = stat_info.st_size
                    modified_time = stat_info.st_mtime
                except OSError:
                    file_size = 0
                    modified_time = 0
                
                # Create model entry
                model_info = {
                    "name": filename,
                    "filename": filename,
                    "folder_type": folder_type,
                    "subfolder": subfolder,
                    "path": os.path.join(subfolder, filename) if subfolder else filename,
                    "full_path": file_path,
                    "relative_path": os.path.relpath(file_path, models_path).replace(os.sep, "/"),
                    "size": file_size,
                    "size_mb": round(file_size / (1024 * 1024), 2),
                    "extension": file_ext,
                    "modified": modified_time,
                    "modified_iso": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(modified_time))
                }
                
                all_models.append(model_info)
        
        # Sort by modification time (newest first)
        all_models.sort(key=lambda x: x['modified'], reverse=True)
        
        # Group by folder type
        grouped_models = {}
        for model in all_models:
            folder_type = model['folder_type']
            if folder_type not in grouped_models:
                grouped_models[folder_type] = []
            grouped_models[folder_type].append(model)
        
        return web.json_response({
            "success": True,
            "models": all_models,
            "grouped": grouped_models,
            "total_count": len(all_models),
            "models_path": models_path,
            "folder_types": list(grouped_models.keys())
        })
        
    except Exception as e:
        return web.json_response({
            "success": False,
            "error": f"Failed to list models: {str(e)}",
            "models": []
        }, status=500)


async def list_models_in_folder(request):
    """List model files in a specific folder"""
    try:
        folder_name = request.match_info['folder_name']
        
        # Get models directory path
        models_path = os.path.join(folder_paths.base_path, "models")
        folder_path = os.path.join(models_path, folder_name)
        
        if not os.path.exists(folder_path):
            return web.json_response({
                "success": False,
                "error": f"Folder not found: {folder_name}",
                "models": []
            })
        
        models = []
        
        # Recursively scan the specific folder
        for root, dirs, files in os.walk(folder_path):
            # Skip hidden directories
            dirs[:] = [d for d in dirs if not d.startswith('.') and not d.startswith('__')]
            
            # Calculate relative path from folder
            rel_path = os.path.relpath(root, folder_path)
            subfolder = "" if rel_path == "." else rel_path.replace(os.sep, "/")
            
            for filename in files:
                if filename.startswith('.') or filename.startswith('__'):
                    continue
                
                # Skip .json files (ComfyUI auto-generated files)
                if filename.lower().endswith('.json'):
                    continue
                
                # Get file extension
                file_ext = os.path.splitext(filename)[1].lower()
                
                file_path = os.path.join(root, filename)
                
                # Get file info
                try:
                    stat_info = os.stat(file_path)
                    file_size = stat_info.st_size
                    modified_time = stat_info.st_mtime
                except OSError:
                    file_size = 0
                    modified_time = 0
                
                # Create model entry
                model_info = {
                    "name": filename,
                    "filename": filename,
                    "folder_type": folder_name,
                    "subfolder": subfolder,
                    "path": os.path.join(subfolder, filename) if subfolder else filename,
                    "relative_path": os.path.join(folder_name, subfolder, filename) if subfolder else os.path.join(folder_name, filename),
                    "full_path": file_path,
                    "size": file_size,
                    "size_mb": round(file_size / (1024 * 1024), 2),
                    "extension": file_ext,
                    "modified": modified_time,
                    "modified_iso": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(modified_time))
                }
                
                models.append(model_info)
        
        # Sort by name
        models.sort(key=lambda x: x['name'].lower())
        
        return web.json_response({
            "success": True,
            "models": models,
            "total_count": len(models),
            "folder_name": folder_name,
            "folder_path": folder_path
        })
        
    except Exception as e:
        return web.json_response({
            "success": False,
            "error": f"Failed to list models in folder: {str(e)}",
            "models": []
        }, status=500)


async def list_loras(request):
    """List all available LoRA models from the loras folder"""
    try:
        # Get loras directory path
        loras_path = os.path.join(folder_paths.base_path, "models", "loras")
        
        if not os.path.exists(loras_path):
            return web.json_response({
                "success": True,
                "models": [],
                "total_count": 0,
                "folder_name": "loras",
                "folder_path": loras_path,
                "message": "LoRAs directory not found"
            })
        
        loras = []
        
        # Recursively scan loras directory
        for root, dirs, files in os.walk(loras_path):
            # Skip hidden directories
            dirs[:] = [d for d in dirs if not d.startswith('.') and not d.startswith('__')]
            
            for filename in files:
                if filename.startswith('.') or filename.startswith('__'):
                    continue
                
                # Skip .json files (ComfyUI auto-generated files)
                if filename.lower().endswith('.json'):
                    continue
                
                # Get file extension
                file_ext = os.path.splitext(filename)[1].lower()
                
                file_path = os.path.join(root, filename)
                
                # Calculate relative path from loras directory
                rel_path = os.path.relpath(root, loras_path)
                subfolder = "" if rel_path == "." else rel_path.replace(os.sep, "/")
                
                # Get file info
                try:
                    stat_info = os.stat(file_path)
                    file_size = stat_info.st_size
                    modified_time = stat_info.st_mtime
                except OSError:
                    file_size = 0
                    modified_time = 0
                
                # Create LoRA entry
                lora_info = {
                    "name": filename,
                    "filename": filename,
                    "folder_type": "loras",
                    "subfolder": subfolder,
                    "path": os.path.join(subfolder, filename) if subfolder else filename,
                    "relative_path": os.path.join("loras", subfolder, filename) if subfolder else os.path.join("loras", filename),
                    "full_path": file_path,
                    "size": file_size,
                    "size_mb": round(file_size / (1024 * 1024), 2),
                    "extension": file_ext,
                    "modified": modified_time,
                    "modified_iso": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(modified_time))
                }
                
                loras.append(lora_info)
        
        # Sort by name
        loras.sort(key=lambda x: x['name'].lower())
        
        # Group by subfolder for better organization
        grouped_loras = {}
        for lora in loras:
            subfolder = lora['subfolder'] or 'root'
            if subfolder not in grouped_loras:
                grouped_loras[subfolder] = []
            grouped_loras[subfolder].append(lora)
        
        return web.json_response({
            "success": True,
            "models": loras,
            "total_count": len(loras),
            "folder_name": "loras",
            "folder_path": loras_path
        })
        
    except Exception as e:
        return web.json_response({
            "success": False,
            "error": f"Failed to list LoRAs: {str(e)}",
            "models": []
        }, status=500)


async def move_model_file(request):
    """Move a model file from one folder to another within the models directory"""
    try:
        data = await request.json()
        
        # Validate required parameters
        required_fields = ['filename', 'source_folder', 'target_folder']
        for field in required_fields:
            if field not in data:
                return web.json_response({
                    "success": False,
                    "error": f"Missing required field: {field}"
                }, status=400)
        
        filename = data['filename']
        source_folder = data['source_folder']
        target_folder = data['target_folder']
        source_subfolder = data.get('source_subfolder', '')
        target_subfolder = data.get('target_subfolder', '')
        new_filename = data.get('new_filename', filename)
        
        # Get models directory path
        models_path = os.path.join(folder_paths.base_path, "models")
        
        if not os.path.exists(models_path):
            return web.json_response({
                "success": False,
                "error": "Models directory not found"
            }, status=404)
        
        # Build source and target paths
        source_folder_path = os.path.join(models_path, source_folder)
        target_folder_path = os.path.join(models_path, target_folder)
        
        if source_subfolder:
            source_folder_path = os.path.join(source_folder_path, source_subfolder)
        if target_subfolder:
            target_folder_path = os.path.join(target_folder_path, target_subfolder)
            
        source_file_path = os.path.join(source_folder_path, filename)
        target_file_path = os.path.join(target_folder_path, new_filename)
        
        # Validate source folder exists
        if not os.path.exists(source_folder_path):
            return web.json_response({
                "success": False,
                "error": f"Source folder does not exist: {source_folder}"
            }, status=404)
        
        # Validate source file exists
        if not os.path.exists(source_file_path):
            return web.json_response({
                "success": False,
                "error": f"Source file does not exist: {filename}"
            }, status=404)
        
        # Validate source file is actually a file
        if not os.path.isfile(source_file_path):
            return web.json_response({
                "success": False,
                "error": f"Source path is not a file: {filename}"
            }, status=400)
        
        # Create target folder if it doesn't exist
        if not os.path.exists(target_folder_path):
            try:
                os.makedirs(target_folder_path, exist_ok=True)
            except Exception as e:
                return web.json_response({
                    "success": False,
                    "error": f"Failed to create target folder: {str(e)}"
                }, status=500)
        
        # Check if target file already exists
        if os.path.exists(target_file_path):
            overwrite = data.get('overwrite', False)
            if not overwrite:
                return web.json_response({
                    "success": False,
                    "error": f"Target file already exists: {new_filename}. Set 'overwrite': true to replace it."
                }, status=409)
        
        # Perform the move operation
        try:
            import shutil
            shutil.move(source_file_path, target_file_path)
            
            # Verify the move was successful
            if not os.path.exists(target_file_path):
                return web.json_response({
                    "success": False,
                    "error": "File move failed: target file was not created"
                }, status=500)
            
            if os.path.exists(source_file_path):
                return web.json_response({
                    "success": False,
                    "error": "File move failed: source file still exists"
                }, status=500)
            
            # Get file info for response
            file_stats = os.stat(target_file_path)
            file_size = file_stats.st_size
            
            return web.json_response({
                "success": True,
                "message": f"Successfully moved {filename} from {source_folder} to {target_folder}",
                "file_info": {
                    "filename": filename,
                    "source_folder": source_folder,
                    "target_folder": target_folder,
                    "file_size": file_size,
                    "new_path": target_file_path
                }
            })
            
        except Exception as e:
            return web.json_response({
                "success": False,
                "error": f"Failed to move file: {str(e)}"
            }, status=500)
        
    except json.JSONDecodeError as e:
        return web.json_response({
            "success": False,
            "error": f"Invalid JSON in request: {str(e)}"
        }, status=400)
    except Exception as e:
        return web.json_response({
            "success": False,
            "error": f"Unexpected error: {str(e)}"
        }, status=500)


async def copy_model_file(request):
    """Copy a model file within the models directory"""
    try:
        data = await request.json()
        
        # Validate required parameters
        required_fields = ['filename', 'source_folder', 'target_folder']
        for field in required_fields:
            if field not in data:
                return web.json_response({
                    "success": False,
                    "error": f"Missing required field: {field}"
                }, status=400)
        
        filename = data['filename']
        source_folder = data['source_folder']
        target_folder = data['target_folder']
        source_subfolder = data.get('source_subfolder', '')
        target_subfolder = data.get('target_subfolder', '')
        new_filename = data.get('new_filename', filename)
        
        # Get models directory path
        models_path = os.path.join(folder_paths.base_path, "models")
        
        if not os.path.exists(models_path):
            return web.json_response({
                "success": False,
                "error": "Models directory not found"
            }, status=404)
        
        # Build source and target paths
        source_folder_path = os.path.join(models_path, source_folder)
        target_folder_path = os.path.join(models_path, target_folder)
        
        if source_subfolder:
            source_folder_path = os.path.join(source_folder_path, source_subfolder)
        if target_subfolder:
            target_folder_path = os.path.join(target_folder_path, target_subfolder)
            
        source_file_path = os.path.join(source_folder_path, filename)
        target_file_path = os.path.join(target_folder_path, new_filename)
        
        # Validate source folder exists
        if not os.path.exists(source_folder_path):
            return web.json_response({
                "success": False,
                "error": f"Source folder does not exist: {source_folder}"
            }, status=404)
        
        # Validate source file exists
        if not os.path.exists(source_file_path):
            return web.json_response({
                "success": False,
                "error": f"Source file does not exist: {filename}"
            }, status=404)
        
        # Create target folder if it doesn't exist
        if not os.path.exists(target_folder_path):
            try:
                os.makedirs(target_folder_path, exist_ok=True)
            except Exception as e:
                return web.json_response({
                    "success": False,
                    "error": f"Failed to create target folder: {str(e)}"
                }, status=500)
        
        # Check if target file already exists
        if os.path.exists(target_file_path):
            overwrite = data.get('overwrite', False)
            if not overwrite:
                return web.json_response({
                    "success": False,
                    "error": f"Target file already exists: {new_filename}. Set 'overwrite': true to replace it."
                }, status=409)
        
        # Check available disk space
        try:
            source_size = os.path.getsize(source_file_path)
            free_space = shutil.disk_usage(target_folder_path).free
            
            if source_size > free_space:
                return web.json_response({
                    "success": False,
                    "error": f"Insufficient disk space. Required: {source_size:,} bytes, Available: {free_space:,} bytes"
                }, status=507)  # HTTP 507 Insufficient Storage
        except Exception as e:
            # Continue if we can't check disk space
            print(f"Warning: Could not check disk space: {e}")
        
        # Perform the copy operation
        try:
            shutil.copy2(source_file_path, target_file_path)
            
            # Verify the copy was successful
            if not os.path.exists(target_file_path):
                return web.json_response({
                    "success": False,
                    "error": "File copy failed: target file was not created"
                }, status=500)
            
            # Get file info for response
            file_stats = os.stat(target_file_path)
            file_size = file_stats.st_size
            
            return web.json_response({
                "success": True,
                "message": f"Successfully copied {filename} from {source_folder} to {target_folder}",
                "file_info": {
                    "filename": filename,
                    "new_filename": new_filename,
                    "source_folder": source_folder,
                    "target_folder": target_folder,
                    "source_subfolder": source_subfolder,
                    "target_subfolder": target_subfolder,
                    "file_size": file_size,
                    "new_path": target_file_path
                }
            })
            
        except Exception as e:
            return web.json_response({
                "success": False,
                "error": f"Failed to copy file: {str(e)}"
            }, status=500)
        
    except json.JSONDecodeError as e:
        return web.json_response({
            "success": False,
            "error": f"Invalid JSON in request: {str(e)}"
        }, status=400)
    except Exception as e:
        return web.json_response({
            "success": False,
            "error": f"Unexpected error: {str(e)}"
        }, status=500)

async def delete_model_file(request):
    """Delete a model file from the models directory"""
    try:
        data = await request.json()
        
        # Validate required parameters
        required_fields = ['filename', 'folder']
        for field in required_fields:
            if field not in data:
                return web.json_response({
                    "success": False,
                    "error": f"Missing required field: {field}"
                }, status=400)
        
        filename = data['filename']
        folder = data['folder']
        subfolder = data.get('subfolder', '')
        
        # Get models directory path
        models_path = os.path.join(folder_paths.base_path, "models")
        
        if not os.path.exists(models_path):
            return web.json_response({
                "success": False,
                "error": "Models directory not found"
            }, status=404)
        
        # Build file path
        folder_path = os.path.join(models_path, folder)
        if subfolder:
            folder_path = os.path.join(folder_path, subfolder)
        file_path = os.path.join(folder_path, filename)
        
        # Validate folder exists
        if not os.path.exists(folder_path):
            return web.json_response({
                "success": False,
                "error": f"Folder does not exist: {folder}"
            }, status=404)
        
        # Validate file exists
        if not os.path.exists(file_path):
            return web.json_response({
                "success": False,
                "error": f"File does not exist: {filename}"
            }, status=404)
        
        # Validate file is actually a file
        if not os.path.isfile(file_path):
            return web.json_response({
                "success": False,
                "error": f"Path is not a file: {filename}"
            }, status=400)
        
        # Get file size before deletion
        try:
            file_size = os.path.getsize(file_path)
        except OSError:
            file_size = 0
        
        # Perform the delete operation
        try:
            os.remove(file_path)
            
            # Verify the delete was successful
            if os.path.exists(file_path):
                return web.json_response({
                    "success": False,
                    "error": "File delete failed: file still exists"
                }, status=500)
            
            return web.json_response({
                "success": True,
                "message": f"Successfully deleted {filename} from {folder}",
                "file_info": {
                    "filename": filename,
                    "folder": folder,
                    "subfolder": subfolder,
                    "file_size": file_size,
                    "deleted_path": file_path
                }
            })
            
        except Exception as e:
            return web.json_response({
                "success": False,
                "error": f"Failed to delete file: {str(e)}"
            }, status=500)
        
    except json.JSONDecodeError as e:
        return web.json_response({
            "success": False,
            "error": f"Invalid JSON in request: {str(e)}"
        }, status=400)
    except Exception as e:
        return web.json_response({
            "success": False,
            "error": f"Unexpected error: {str(e)}"
        }, status=500)

async def rename_model_file(request):
    """Rename a model file within the models directory"""
    try:
        data = await request.json()
        
        # Validate required parameters
        required_fields = ['old_filename', 'new_filename', 'folder']
        for field in required_fields:
            if field not in data:
                return web.json_response({
                    "success": False,
                    "error": f"Missing required field: {field}"
                }, status=400)
        
        old_filename = data['old_filename']
        new_filename = data['new_filename']
        folder = data['folder']
        subfolder = data.get('subfolder', '')
        
        # Get models directory path
        models_path = os.path.join(folder_paths.base_path, "models")
        
        if not os.path.exists(models_path):
            return web.json_response({
                "success": False,
                "error": "Models directory not found"
            }, status=404)
        
        # Build file paths
        folder_path = os.path.join(models_path, folder)
        if subfolder:
            folder_path = os.path.join(folder_path, subfolder)
        old_file_path = os.path.join(folder_path, old_filename)
        new_file_path = os.path.join(folder_path, new_filename)
        
        # Validate folder exists
        if not os.path.exists(folder_path):
            return web.json_response({
                "success": False,
                "error": f"Folder does not exist: {folder}"
            }, status=404)
        
        # Validate old file exists
        if not os.path.exists(old_file_path):
            return web.json_response({
                "success": False,
                "error": f"Source file does not exist: {old_filename}"
            }, status=404)
        
        # Check if new filename already exists
        if os.path.exists(new_file_path):
            overwrite = data.get('overwrite', False)
            if not overwrite:
                return web.json_response({
                    "success": False,
                    "error": f"Target filename already exists: {new_filename}. Set 'overwrite': true to replace it."
                }, status=409)
        
        # Perform the rename operation
        try:
            os.rename(old_file_path, new_file_path)
            
            # Verify the rename was successful
            if not os.path.exists(new_file_path):
                return web.json_response({
                    "success": False,
                    "error": "File rename failed: target file was not created"
                }, status=500)
            
            if os.path.exists(old_file_path):
                return web.json_response({
                    "success": False,
                    "error": "File rename failed: source file still exists"
                }, status=500)
            
            # Update trigger words if this is a LoRA file and trigger words exist
            trigger_word_rename_success = True
            if folder.lower() == 'loras':
                trigger_word_rename_success = rename_trigger_word_key(old_filename, new_filename)
                if not trigger_word_rename_success:
                    print(f"[WARNING] File renamed successfully but trigger words key rename failed for '{old_filename}' -> '{new_filename}'")
            
            # Get file info for response
            file_stats = os.stat(new_file_path)
            file_size = file_stats.st_size
            
            response_data = {
                "success": True,
                "message": f"Successfully renamed {old_filename} to {new_filename}",
                "file_info": {
                    "old_filename": old_filename,
                    "new_filename": new_filename,
                    "folder": folder,
                    "subfolder": subfolder,
                    "file_size": file_size,
                    "new_path": new_file_path
                }
            }
            
            # Add trigger word information if this was a LoRA
            if folder.lower() == 'loras':
                response_data["trigger_words_updated"] = trigger_word_rename_success
                if not trigger_word_rename_success:
                    response_data["warning"] = "File renamed successfully but trigger words key could not be updated"
            
            return web.json_response(response_data)
            
        except Exception as e:
            return web.json_response({
                "success": False,
                "error": f"Failed to rename file: {str(e)}"
            }, status=500)
        
    except json.JSONDecodeError as e:
        return web.json_response({
            "success": False,
            "error": f"Invalid JSON in request: {str(e)}"
        }, status=400)
    except Exception as e:
        return web.json_response({
            "success": False,
            "error": f"Unexpected error: {str(e)}"
        }, status=500)

async def search_models(request):
    """Search for model files by name across all model folders"""
    try:
        query = request.query.get('q', '').strip()
        folder_type = request.query.get('folder_type', '').strip()

        if not query:
            return web.json_response({
                "success": False,
                "error": "Search query parameter 'q' is required"
            }, status=400)

        # Get models directory path
        models_path = os.path.join(folder_paths.base_path, "models")

        if not os.path.exists(models_path):
            return web.json_response({
                "success": False,
                "error": "Models directory not found",
                "results": []
            })

        results = []
        query_lower = query.lower()

        # Determine search path
        search_path = models_path
        if folder_type:
            folder_path = os.path.join(models_path, folder_type)
            if os.path.exists(folder_path):
                search_path = folder_path
            else:
                return web.json_response({
                    "success": False,
                    "error": f"Folder type not found: {folder_type}",
                    "results": []
                })

        # Recursively search for matching files
        for root, dirs, files in os.walk(search_path):
            # Skip hidden directories
            dirs[:] = [d for d in dirs if not d.startswith('.') and not d.startswith('__')]

            # Calculate relative path from models directory
            rel_path = os.path.relpath(root, models_path)
            if rel_path == ".":
                current_folder_type = "root"
                subfolder = ""
            else:
                path_parts = rel_path.split(os.sep)
                current_folder_type = path_parts[0]
                subfolder = os.path.join(*path_parts[1:]).replace(os.sep, "/") if len(path_parts) > 1 else ""

            for filename in files:
                if filename.startswith('.') or filename.startswith('__'):
                    continue

                # Skip .json files (ComfyUI auto-generated files)
                if filename.lower().endswith('.json'):
                    continue

                # Check if filename contains the search query
                if query_lower not in filename.lower():
                    continue

                # Get file extension
                file_ext = os.path.splitext(filename)[1].lower()

                file_path = os.path.join(root, filename)

                # Get file info
                try:
                    stat_info = os.stat(file_path)
                    file_size = stat_info.st_size
                    modified_time = stat_info.st_mtime
                except OSError:
                    file_size = 0
                    modified_time = 0

                # Create result entry
                result_info = {
                    "name": filename,
                    "filename": filename,
                    "folder_type": current_folder_type,
                    "subfolder": subfolder,
                    "path": os.path.join(subfolder, filename) if subfolder else filename,
                    "full_path": file_path,
                    "relative_path": os.path.relpath(file_path, models_path).replace(os.sep, "/"),
                    "size": file_size,
                    "size_mb": round(file_size / (1024 * 1024), 2),
                    "extension": file_ext,
                    "modified": modified_time,
                    "modified_iso": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(modified_time)),
                    "match_type": "filename"
                }

                results.append(result_info)

        # Sort by relevance (exact matches first, then by name)
        def sort_key(item):
            filename_lower = item['filename'].lower()
            if filename_lower == query_lower:
                return (0, filename_lower)  # Exact match
            elif filename_lower.startswith(query_lower):
                return (1, filename_lower)  # Starts with query
            else:
                return (2, filename_lower)  # Contains query

        results.sort(key=sort_key)

        # Limit results to avoid overwhelming the client
        max_results = 100
        if len(results) > max_results:
            results = results[:max_results]

        return web.json_response({
            "success": True,
            "query": query,
            "folder_type": folder_type or "all",
            "results": results,
            "total_found": len(results),
            "limited": len(results) == max_results
        })

    except Exception as e:
        return web.json_response({
            "success": False,
            "error": f"Failed to search models: {str(e)}",
            "results": []
        }, status=500)


async def check_file_exists(request):
    """Check if a file already exists before uploading"""
    try:
        data = await request.json()
        filename = data.get('filename')
        folder = data.get('folder')
        subfolder = data.get('subfolder', '')

        if not filename or not folder:
            return web.json_response({
                "success": False,
                "error": "filename and folder are required"
            }, status=400)

        # Security checks
        if '..' in folder or '/' in folder or '\\' in folder:
            return web.json_response({
                "success": False,
                "error": "Invalid folder name"
            }, status=400)

        if subfolder and ('..' in subfolder or subfolder.startswith('/') or subfolder.startswith('\\')):
            return web.json_response({
                "success": False,
                "error": "Invalid subfolder path"
            }, status=400)

        if '..' in filename or '/' in filename or '\\' in filename:
            return web.json_response({
                "success": False,
                "error": "Invalid filename"
            }, status=400)

        # Build target path
        models_path = os.path.join(folder_paths.base_path, "models")
        target_folder_path = os.path.join(models_path, folder)
        if subfolder:
            target_folder_path = os.path.join(target_folder_path, subfolder)

        target_file_path = os.path.join(target_folder_path, filename)

        # Check if file exists
        exists = os.path.exists(target_file_path)

        return web.json_response({
            "success": True,
            "exists": exists,
            "path": target_file_path if exists else None
        })

    except Exception as e:
        return web.json_response({
            "success": False,
            "error": f"Failed to check file: {str(e)}"
        }, status=500)


async def list_partial_uploads(request):
    """List all partial/incomplete uploads that can be resumed"""
    try:
        models_path = os.path.join(folder_paths.base_path, "models")

        if not os.path.exists(models_path):
            return web.json_response({
                "success": False,
                "error": "Models directory not found",
                "partial_uploads": []
            })

        partial_uploads = []

        # Find all .uploading_* files in models directory
        for item in os.listdir(models_path):
            if item.startswith('.uploading_') and os.path.isfile(os.path.join(models_path, item)):
                file_path = os.path.join(models_path, item)

                # Extract original filename
                original_filename = item.replace('.uploading_', '')

                # Get file info
                try:
                    stat_info = os.stat(file_path)
                    file_size = stat_info.st_size
                    modified_time = stat_info.st_mtime

                    partial_uploads.append({
                        "filename": original_filename,
                        "partial_filename": item,
                        "partial_path": file_path,
                        "bytes_uploaded": file_size,
                        "size_mb": round(file_size / (1024 * 1024), 2),
                        "modified": modified_time,
                        "modified_iso": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(modified_time))
                    })
                except OSError:
                    continue

        # Sort by modification time (newest first)
        partial_uploads.sort(key=lambda x: x['modified'], reverse=True)

        return web.json_response({
            "success": True,
            "partial_uploads": partial_uploads,
            "total_count": len(partial_uploads)
        })

    except Exception as e:
        return web.json_response({
            "success": False,
            "error": f"Failed to list partial uploads: {str(e)}",
            "partial_uploads": []
        }, status=500)


async def delete_partial_upload(request):
    """Delete a specific partial upload file"""
    try:
        data = await request.json()
        partial_filename = data.get('partial_filename')

        if not partial_filename:
            return web.json_response({
                "success": False,
                "error": "partial_filename is required"
            }, status=400)

        models_path = os.path.join(folder_paths.base_path, "models")
        partial_path = os.path.join(models_path, partial_filename)

        if not os.path.exists(partial_path):
            return web.json_response({
                "success": False,
                "error": f"Partial upload file not found: {partial_filename}"
            }, status=404)

        # Security: ensure it's a .uploading_ file
        if not partial_filename.startswith('.uploading_'):
            return web.json_response({
                "success": False,
                "error": "Invalid partial filename"
            }, status=400)

        os.remove(partial_path)
        print(f"[UPLOAD] Deleted partial upload: {partial_path}")

        return web.json_response({
            "success": True,
            "message": f"Successfully deleted partial upload: {partial_filename}"
        })

    except Exception as e:
        return web.json_response({
            "success": False,
            "error": f"Failed to delete partial upload: {str(e)}"
        }, status=500)


async def upload_model_file(request):
    """Upload a model file to a specific folder in the models directory with resume support"""
    uploading_file_path = None
    temp_upload_file = None
    try:
        print(f"\n[UPLOAD] Starting model file upload...")
        reader = await request.multipart()

        has_file = False
        filename = None
        folder = None
        subfolder = ''
        overwrite = False
        temp_bytes = 0
        resume_offset = 0

        # Get models path early
        models_path = os.path.join(folder_paths.base_path, "models")

        # Strategy: Save file to temp IMMEDIATELY when encountered (can't defer)
        # Then validate AFTER streaming is done
        file_streamed = False
        temp_upload_file = None

        async for field in reader:
            if field.name == 'file' or field.name == 'model':
                if not filename:
                    filename = field.filename or 'untitled.safetensors'
                print(f"[UPLOAD] File field found: {filename}")

                # Stream to temp immediately (MUST do this now, can't defer)
                temp_upload_file = os.path.join(models_path, f".uploading_{filename}")

                # Check if resumable partial file exists
                if os.path.exists(temp_upload_file):
                    resume_offset = os.path.getsize(temp_upload_file)
                    print(f"[UPLOAD] Resuming from offset: {resume_offset:,} bytes ({resume_offset / (1024 * 1024):.1f} MB)")
                    mode = 'ab'
                else:
                    print(f"[UPLOAD] Streaming to temp: {temp_upload_file}")
                    mode = 'wb'
                    resume_offset = 0

                chunk_size = 1048576
                start_time = time.time()
                last_log_time = start_time
                temp_bytes = resume_offset

                with open(temp_upload_file, mode) as f:
                    while True:
                        chunk = await field.read_chunk(chunk_size)
                        if not chunk:
                            break
                        f.write(chunk)
                        temp_bytes += len(chunk)

                        current_time = time.time()
                        if temp_bytes % (100 * 1024 * 1024) < chunk_size or (current_time - last_log_time) > 5:
                            elapsed = current_time - start_time
                            speed_mbps = ((temp_bytes - resume_offset) / (1024 * 1024)) / elapsed if elapsed > 0 else 0
                            print(f"[UPLOAD] Progress: {temp_bytes / (1024 * 1024):.1f} MB ({speed_mbps:.1f} MB/s)")
                            last_log_time = current_time

                elapsed_total = time.time() - start_time
                uploaded_mb = (temp_bytes - resume_offset) / (1024 * 1024)
                avg_speed = uploaded_mb / elapsed_total if elapsed_total > 0 else 0
                file_streamed = True
                print(f"[UPLOAD] Streaming complete: {temp_bytes:,} bytes ({temp_bytes / (1024 * 1024):.1f} MB total) in {elapsed_total:.1f}s (avg {avg_speed:.1f} MB/s)")

            elif field.name == 'filename':
                filename = (await field.read()).decode('utf-8').strip()
            elif field.name == 'folder':
                folder = (await field.read()).decode('utf-8').strip()
            elif field.name == 'subfolder':
                subfolder = (await field.read()).decode('utf-8').strip()
            elif field.name == 'overwrite':
                overwrite_value = (await field.read()).decode('utf-8').strip().lower()
                overwrite = overwrite_value in ('true', '1', 'yes')

        # NOW validate after streaming (file is safely in temp)
        if not file_streamed:
            print("[UPLOAD] Error: No file provided")
            return web.json_response({
                "success": False,
                "error": "No file provided"
            }, status=400)

        if not folder:
            print("[UPLOAD] Error: No folder specified")
            # Clean up temp file
            if temp_upload_file and os.path.exists(temp_upload_file):
                os.remove(temp_upload_file)
            return web.json_response({
                "success": False,
                "error": "Folder parameter is required (e.g., 'checkpoints', 'loras', 'vae')"
            }, status=400)

        if not filename:
            filename = "untitled.safetensors"

        print(f"[UPLOAD] Validating - folder: {folder}, subfolder: {subfolder}, filename: {filename}, overwrite: {overwrite}")

        # Security checks
        if '..' in folder or '/' in folder or '\\' in folder:
            print(f"[UPLOAD] Error: Invalid folder name: {folder}")
            if temp_upload_file and os.path.exists(temp_upload_file):
                os.remove(temp_upload_file)
            return web.json_response({
                "success": False,
                "error": "Invalid folder name"
            }, status=400)

        if subfolder and ('..' in subfolder or subfolder.startswith('/') or subfolder.startswith('\\')):
            print(f"[UPLOAD] Error: Invalid subfolder path: {subfolder}")
            if temp_upload_file and os.path.exists(temp_upload_file):
                os.remove(temp_upload_file)
            return web.json_response({
                "success": False,
                "error": "Invalid subfolder path"
            }, status=400)

        if '..' in filename or '/' in filename or '\\' in filename:
            print(f"[UPLOAD] Error: Invalid filename: {filename}")
            if temp_upload_file and os.path.exists(temp_upload_file):
                os.remove(temp_upload_file)
            return web.json_response({
                "success": False,
                "error": "Invalid filename"
            }, status=400)

        # Build target path
        target_folder_path = os.path.join(models_path, folder)
        if subfolder:
            target_folder_path = os.path.join(target_folder_path, subfolder)

        print(f"[UPLOAD] Target path: {target_folder_path}")

        # Create target folder if it doesn't exist
        if not os.path.exists(target_folder_path):
            try:
                print(f"[UPLOAD] Creating target folder: {target_folder_path}")
                os.makedirs(target_folder_path, exist_ok=True)
            except Exception as e:
                print(f"[UPLOAD] Error: Failed to create target folder: {e}")
                if temp_upload_file and os.path.exists(temp_upload_file):
                    os.remove(temp_upload_file)
                return web.json_response({
                    "success": False,
                    "error": f"Failed to create target folder: {str(e)}"
                }, status=500)

        target_file_path = os.path.join(target_folder_path, filename)

        # Check if file exists (after streaming, but before moving)
        if os.path.exists(target_file_path) and not overwrite:
            print(f"[UPLOAD] Error: File already exists: {target_file_path}")
            # Keep temp file for potential resume
            print(f"[UPLOAD] Temp file kept for resume: {temp_upload_file}")
            return web.json_response({
                "success": False,
                "error": f"File '{filename}' already exists in {folder}{'/' + subfolder if subfolder else ''}. Enable overwrite or delete the existing file first.",
                "existing_file": True
            }, status=409)

        # Verify temp file size before moving
        temp_file_size = os.path.getsize(temp_upload_file)
        print(f"[UPLOAD] Temp file size verification: {temp_file_size:,} bytes ({temp_file_size / (1024 * 1024):.2f} MB)")

        # Move temp file to final location
        try:
            move_start = time.time()
            print(f"[UPLOAD] Moving to final location: {target_file_path}")

            # Use os.replace for atomic move (faster than shutil.move on same drive)
            try:
                os.replace(temp_upload_file, target_file_path)
                move_time = time.time() - move_start
                print(f"[UPLOAD] File moved in {move_time:.2f}s")
            except OSError:
                # Fallback to shutil.move if cross-device
                print(f"[UPLOAD] Using shutil.move (cross-device)")
                shutil.move(temp_upload_file, target_file_path)
                move_time = time.time() - move_start
                print(f"[UPLOAD] File moved in {move_time:.2f}s")

            # Verify the final file exists
            if not os.path.exists(target_file_path):
                print(f"[UPLOAD] Error: File was not created after move")
                return web.json_response({
                    "success": False,
                    "error": "File upload failed: file was not created after move"
                }, status=500)

            # Get file info for response
            file_stats = os.stat(target_file_path)
            actual_size = file_stats.st_size
            modified_time = file_stats.st_mtime

            # Verify file size matches
            if actual_size != temp_file_size:
                print(f"[UPLOAD] WARNING: File size mismatch! Temp: {temp_file_size:,}, Final: {actual_size:,}")

            print(f"[UPLOAD] Success: File uploaded - {filename} ({actual_size:,} bytes = {actual_size / (1024 * 1024):.2f} MB = {actual_size / (1024 ** 3):.2f} GiB)")

            return web.json_response({
                "success": True,
                "message": f"Successfully uploaded {filename} to {folder}" + (f"/{subfolder}" if subfolder else ""),
                "file_info": {
                    "filename": filename,
                    "folder": folder,
                    "subfolder": subfolder,
                    "size": actual_size,
                    "size_mb": round(actual_size / (1024 * 1024), 2),
                    "modified": modified_time,
                    "modified_iso": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(modified_time)),
                    "path": target_file_path,
                    "relative_path": os.path.join(folder, subfolder, filename) if subfolder else os.path.join(folder, filename)
                }
            })

        except Exception as e:
            print(f"[UPLOAD] Error: Failed to move file: {e}")
            # Clean up temp file if it exists
            if temp_upload_file and os.path.exists(temp_upload_file):
                try:
                    os.remove(temp_upload_file)
                    print(f"[UPLOAD] Cleaned up temp file: {temp_upload_file}")
                except:
                    pass
            return web.json_response({
                "success": False,
                "error": f"Failed to move file: {str(e)}"
            }, status=500)

    except Exception as e:
        error_msg = str(e)
        print(f"[UPLOAD] Error: Upload failed: {error_msg}")

        # Check if this is a connection error (resumable)
        is_connection_error = any(keyword in error_msg.lower() for keyword in
                                  ['connection', 'timeout', 'closed', 'reset', 'broken pipe'])

        if is_connection_error and temp_upload_file and os.path.exists(temp_upload_file):
            # Keep partial file for resume
            partial_size = os.path.getsize(temp_upload_file)
            print(f"[UPLOAD] Connection error - keeping partial file for resume: {partial_size:,} bytes ({partial_size / (1024 * 1024):.1f} MB)")
            print(f"[UPLOAD] Resume file location: {temp_upload_file}")
            return web.json_response({
                "success": False,
                "error": f"Upload interrupted: {error_msg}",
                "resumable": True,
                "bytes_uploaded": partial_size
            }, status=500)
        else:
            # Non-resumable error - clean up
            if temp_upload_file and os.path.exists(temp_upload_file):
                try:
                    os.remove(temp_upload_file)
                    print(f"[UPLOAD] Cleaned up temp file after non-resumable error: {temp_upload_file}")
                except:
                    pass
            return web.json_response({
                "success": False,
                "error": f"Upload failed: {error_msg}"
            }, status=500)
