import os
import shutil
import io
import time
import hashlib
from typing import Dict, List, Any, Optional
from aiohttp import web
from PIL import Image
import folder_paths
from ..utils.file_utils import (
    scan_directory_recursive, categorize_files, validate_filename, 
    build_file_path, is_video_file, find_matching_thumbnail
)

def get_folder_path(folder_type: str) -> str:
    """Get the absolute path for a folder type"""
    if folder_type == "input":
        return folder_paths.get_input_directory()
    elif folder_type == "output":
        return folder_paths.get_output_directory()
    elif folder_type == "temp":
        return folder_paths.get_temp_directory()
    else:
        raise ValueError(f"Invalid folder type: {folder_type}")

async def list_all_files(request):
    """List all files from input, temp, and output directories with subfolder information"""
    try:
        # Get ComfyUI folder paths
        input_path = folder_paths.get_input_directory()
        output_path = folder_paths.get_output_directory() 
        temp_path = folder_paths.get_temp_directory()
        
        # Scan all directories
        all_files = []
        all_files.extend(scan_directory_recursive(input_path, "input"))
        all_files.extend(scan_directory_recursive(output_path, "output"))
        all_files.extend(scan_directory_recursive(temp_path, "temp"))
        
        # Sort by modification time (newest first)
        all_files.sort(key=lambda x: x["modified"], reverse=True)
        
        # Categorize files
        categorized = categorize_files(all_files)
        
        # Add summary statistics
        stats = {
            "total_files": len(all_files),
            "by_type": {
                "images": len(categorized["images"]),
                "videos": len(categorized["videos"]), 
                "files": len(categorized["files"])
            },
            "by_folder": {
                "input": len([f for f in all_files if f["type"] == "input"]),
                "output": len([f for f in all_files if f["type"] == "output"]),
                "temp": len([f for f in all_files if f["type"] == "temp"])
            }
        }
        
        return web.json_response({
            "status": "success",
            "stats": stats,
            "images": categorized["images"],
            "videos": categorized["videos"],
            "files": categorized["files"]
        })
        
    except Exception as e:
        return web.json_response({
            "status": "error",
            "message": str(e)
        }, status=500)

async def list_files_by_type(request):
    """List files from a specific folder type (input, output, temp)"""
    try:
        folder_type = request.match_info['folder_type'].lower()
        
        if folder_type not in ['input', 'output', 'temp']:
            return web.json_response({
                "status": "error",
                "message": "Invalid folder type. Must be 'input', 'output', or 'temp'"
            }, status=400)
        
        # Get appropriate folder path
        if folder_type == "input":
            base_path = folder_paths.get_input_directory()
        elif folder_type == "output":
            base_path = folder_paths.get_output_directory()
        else:  # temp
            base_path = folder_paths.get_temp_directory()
        
        # Scan directory
        files = scan_directory_recursive(base_path, folder_type)
        
        # Sort by modification time (newest first)
        files.sort(key=lambda x: x["modified"], reverse=True)
        
        # Categorize files
        categorized = categorize_files(files)
        
        # Add summary statistics
        stats = {
            "folder_type": folder_type,
            "folder_path": base_path,
            "total_files": len(files),
            "by_type": {
                "images": len(categorized["images"]),
                "videos": len(categorized["videos"]),
                "files": len(categorized["files"])
            }
        }
        
        return web.json_response({
            "status": "success",
            "stats": stats,
            "images": categorized["images"],
            "videos": categorized["videos"], 
            "files": categorized["files"]
        })
        
    except Exception as e:
        return web.json_response({
            "status": "error",
            "message": str(e)
        }, status=500)



async def delete_files(request):
    """Delete one or multiple files"""
    try:
        data = await request.json()
        
        # Support both single file and batch deletion
        files_to_delete = data.get('files', [])
        if not files_to_delete:
            # Single file format for backward compatibility
            single_file = {
                'filename': data.get('filename'),
                'subfolder': data.get('subfolder', ''),
                'type': data.get('type', 'output')
            }
            if single_file['filename']:
                files_to_delete = [single_file]
        
        if not files_to_delete:
            return web.json_response({
                "status": "error",
                "message": "No files specified for deletion"
            }, status=400)
        
        results = []
        deleted_count = 0
        
        for file_info in files_to_delete:
            filename = file_info.get('filename')
            subfolder = file_info.get('subfolder', '')
            folder_type = file_info.get('type', 'output')
            
            try:
                # Validate inputs
                if not validate_filename(filename):
                    results.append({
                        "filename": filename,
                        "status": "error",
                        "message": "Invalid filename"
                    })
                    continue
                
                if folder_type not in ['input', 'output', 'temp']:
                    results.append({
                        "filename": filename,
                        "status": "error", 
                        "message": f"Invalid folder type: {folder_type}"
                    })
                    continue
                
                # Build file path
                file_path = build_file_path(folder_type, filename, subfolder)
                
                # Check if file exists
                if not os.path.exists(file_path):
                    results.append({
                        "filename": filename,
                        "status": "error",
                        "message": "File not found"
                    })
                    continue
                
                # Delete file
                os.remove(file_path)
                deleted_count += 1
                
                results.append({
                    "filename": filename,
                    "subfolder": subfolder,
                    "type": folder_type,
                    "status": "success",
                    "message": "File deleted successfully"
                })
                
                print(f"✅ Deleted file: {file_path}")
                
            except Exception as e:
                results.append({
                    "filename": filename,
                    "status": "error",
                    "message": str(e)
                })
        
        return web.json_response({
            "status": "success",
            "message": f"Processed {len(files_to_delete)} files, deleted {deleted_count}",
            "deleted_count": deleted_count,
            "results": results
        })
        
    except Exception as e:
        return web.json_response({
            "status": "error",
            "message": str(e)
        }, status=500)

async def move_files(request):
    """Move one or multiple files between folders"""
    try:
        data = await request.json()
        
        # Get destination folder
        destination_type = data.get('destination_type')
        if not destination_type or destination_type not in ['input', 'output', 'temp']:
            return web.json_response({
                "status": "error",
                "message": "Valid destination_type required (input, output, or temp)"
            }, status=400)
        
        # Support both single file and batch move
        files_to_move = data.get('files', [])
        if not files_to_move:
            # Single file format for backward compatibility
            single_file = {
                'filename': data.get('filename'),
                'subfolder': data.get('subfolder', ''),
                'type': data.get('type', 'output')
            }
            if single_file['filename']:
                files_to_move = [single_file]
        
        if not files_to_move:
            return web.json_response({
                "status": "error",
                "message": "No files specified for moving"
            }, status=400)
        
        results = []
        moved_count = 0
        
        for file_info in files_to_move:
            filename = file_info.get('filename')
            subfolder = file_info.get('subfolder', '')
            source_type = file_info.get('type', 'output')
            
            try:
                # Validate inputs
                if not validate_filename(filename):
                    results.append({
                        "filename": filename,
                        "status": "error",
                        "message": "Invalid filename"
                    })
                    continue
                
                if source_type not in ['input', 'output', 'temp']:
                    results.append({
                        "filename": filename,
                        "status": "error",
                        "message": f"Invalid source folder type: {source_type}"
                    })
                    continue
                
                # Skip if source and destination are the same
                if source_type == destination_type:
                    results.append({
                        "filename": filename,
                        "status": "skipped",
                        "message": "Source and destination are the same"
                    })
                    continue
                
                # Build source and destination paths
                source_path = build_file_path(source_type, filename, subfolder)
                destination_path = build_file_path(destination_type, filename, subfolder)
                
                # Check if source file exists
                if not os.path.exists(source_path):
                    results.append({
                        "filename": filename,
                        "status": "error",
                        "message": "Source file not found"
                    })
                    continue
                
                # Create destination subfolder if needed
                dest_dir = os.path.dirname(destination_path)
                if not os.path.exists(dest_dir):
                    os.makedirs(dest_dir, exist_ok=True)
                
                # Handle existing destination file
                if os.path.exists(destination_path):
                    # Create backup name
                    base, ext = os.path.splitext(destination_path)
                    counter = 1
                    while os.path.exists(f"{base}_{counter}{ext}"):
                        counter += 1
                    backup_path = f"{base}_{counter}{ext}"
                    shutil.move(destination_path, backup_path)
                    print(f"📝 Moved existing file to: {backup_path}")
                
                # Move file
                shutil.move(source_path, destination_path)
                moved_count += 1
                
                results.append({
                    "filename": filename,
                    "subfolder": subfolder,
                    "source_type": source_type,
                    "destination_type": destination_type,
                    "status": "success",
                    "message": "File moved successfully"
                })
                
                print(f"✅ Moved file: {source_path} -> {destination_path}")
                
            except Exception as e:
                results.append({
                    "filename": filename,
                    "status": "error",
                    "message": str(e)
                })
        
        return web.json_response({
            "status": "success",
            "message": f"Processed {len(files_to_move)} files, moved {moved_count}",
            "moved_count": moved_count,
            "destination_type": destination_type,
            "results": results
        })
        
    except Exception as e:
        return web.json_response({
            "status": "error",
            "message": str(e)
        }, status=500)


async def copy_files(request):
    """Copy one or multiple files between folders"""
    try:
        data = await request.json()
        
        # Get destination folder
        destination_type = data.get('destination_type')
        if not destination_type or destination_type not in ['input', 'output', 'temp']:
            return web.json_response({
                "status": "error",
                "message": "Valid destination_type required (input, output, or temp)"
            }, status=400)
        
        # Support both single file and batch copy
        files_to_copy = data.get('files', [])
        if not files_to_copy:
            # Single file format for backward compatibility
            single_file = {
                'filename': data.get('filename'),
                'subfolder': data.get('subfolder', ''),
                'type': data.get('type', 'output')
            }
            if single_file['filename']:
                files_to_copy = [single_file]
        
        if not files_to_copy:
            return web.json_response({
                "status": "error",
                "message": "No files specified for copying"
            }, status=400)
        
        results = []
        copied_count = 0
        
        for file_info in files_to_copy:
            filename = file_info.get('filename')
            subfolder = file_info.get('subfolder', '')
            source_type = file_info.get('type', 'output')
            
            try:
                # Validate inputs
                if not validate_filename(filename):
                    results.append({
                        "filename": filename,
                        "status": "error",
                        "message": "Invalid filename"
                    })
                    continue
                
                if source_type not in ['input', 'output', 'temp']:
                    results.append({
                        "filename": filename,
                        "status": "error",
                        "message": f"Invalid source folder type: {source_type}"
                    })
                    continue
                
                # Skip if source and destination are the same
                if source_type == destination_type:
                    results.append({
                        "filename": filename,
                        "status": "skipped",
                        "message": "Source and destination are the same"
                    })
                    continue
                
                # Build source and destination paths
                source_path = build_file_path(source_type, filename, subfolder)
                destination_path = build_file_path(destination_type, filename, subfolder)
                
                # Check if source file exists
                if not os.path.exists(source_path):
                    results.append({
                        "filename": filename,
                        "status": "error",
                        "message": "Source file not found"
                    })
                    continue
                
                # Create destination subfolder if needed
                dest_dir = os.path.dirname(destination_path)
                if not os.path.exists(dest_dir):
                    os.makedirs(dest_dir, exist_ok=True)
                
                # Overwrite existing destination file if it exists
                final_destination_path = destination_path
                if os.path.exists(destination_path):
                    print(f"📝 File exists, overwriting: {destination_path}")
                
                # Copy file (overwrite if exists)
                shutil.copy2(source_path, final_destination_path)
                copied_count += 1
                
                # If it's a video file being copied to input folder, also try to copy matching thumbnail
                thumbnail_copied = False
                if is_video_file(filename) and destination_type == 'input':
                    matching_thumbnail = find_matching_thumbnail(filename, source_type, subfolder)
                    if matching_thumbnail:
                        try:
                            # Build paths for thumbnail
                            thumbnail_source_path = build_file_path(source_type, matching_thumbnail, subfolder)
                            thumbnail_destination_path = build_file_path(destination_type, matching_thumbnail, subfolder)
                            
                            if os.path.exists(thumbnail_source_path):
                                # Create destination subfolder for thumbnail if needed
                                thumbnail_dest_dir = os.path.dirname(thumbnail_destination_path)
                                if not os.path.exists(thumbnail_dest_dir):
                                    os.makedirs(thumbnail_dest_dir, exist_ok=True)
                                
                                # Copy thumbnail (overwrite if exists)
                                shutil.copy2(thumbnail_source_path, thumbnail_destination_path)
                                thumbnail_copied = True
                                print(f"📸 Auto-copied video thumbnail: {thumbnail_source_path} -> {thumbnail_destination_path}")
                        except Exception as thumb_error:
                            print(f"⚠️ Failed to copy video thumbnail {matching_thumbnail}: {thumb_error}")
                
                # Get the final filename for response
                final_filename = os.path.basename(final_destination_path)
                
                results.append({
                    "filename": filename,
                    "final_filename": final_filename,
                    "subfolder": subfolder,
                    "source_type": source_type,
                    "destination_type": destination_type,
                    "status": "success",
                    "message": f"File copied successfully{' (with thumbnail)' if thumbnail_copied else ''}"
                })
                
                print(f"✅ Copied file: {source_path} -> {final_destination_path}{' (with thumbnail)' if thumbnail_copied else ''}")
                
            except Exception as e:
                results.append({
                    "filename": filename,
                    "status": "error",
                    "message": str(e)
                })
        
        return web.json_response({
            "status": "success",
            "message": f"Processed {len(files_to_copy)} files, copied {copied_count}",
            "copied_count": copied_count,
            "destination_type": destination_type,
            "results": results
        })
        
    except Exception as e:
        return web.json_response({
            "status": "error",
            "message": str(e)
        }, status=500)


async def view_thumbnail(request):
    """
    Get a resized thumbnail of an image with disk caching.
    Query params: filename, subfolder, type, width (default 256)
    """
    try:
        query = request.query
        filename = query.get('filename')
        subfolder = query.get('subfolder', '')
        folder_type = query.get('type', 'output')
        width = int(query.get('width', 256))
        
        if not filename:
            return web.Response(status=400, text="Filename required")
            
        # Build original file path
        try:
            file_path = build_file_path(folder_type, filename, subfolder)
        except ValueError as e:
            return web.Response(status=403, text=str(e))
            
        if not os.path.exists(file_path):
            return web.Response(status=404, text="File not found")
            
        # Get original file stats for cache validation
        stat = os.stat(file_path)
        mtime = stat.st_mtime
        size = stat.st_size
        
        # Create cache directory in temp folder
        temp_dir = folder_paths.get_temp_directory()
        cache_dir = os.path.join(temp_dir, ".mobile_thumbnails")
        if not os.path.exists(cache_dir):
            os.makedirs(cache_dir, exist_ok=True)
            
        # Generate cache key based on path and width
        cache_key = hashlib.md5(f"{file_path}_{width}".encode()).hexdigest()
        cache_path = os.path.join(cache_dir, f"{cache_key}.jpg")
        
        # Check if valid cache exists
        use_cache = False
        if os.path.exists(cache_path):
            cache_stat = os.stat(cache_path)
            # If cache is newer than original, we can use it
            if cache_stat.st_mtime >= mtime:
                use_cache = True
                
        if use_cache:
            return web.FileResponse(cache_path)
            
        # Create thumbnail
        try:
            with Image.open(file_path) as img:
                # Calculate aspect ratio
                aspect = img.height / img.width
                height = int(width * aspect)
                
                # Resize if needed (don't upscale)
                if img.width > width:
                    # Use Lanczos (standard in modern PILLOW) or Bilinear for speed
                    # PILLOW 10.0+ uses Resampling.LANCZOS, older uses Image.LANCZOS
                    resample_filter = getattr(Image, 'Resampling', Image).LANCZOS
                    img = img.resize((width, height), resample_filter)
                
                # Convert to RGB if necessary (e.g. for PNG with alpha to JPG)
                if img.mode in ('RGBA', 'P', 'LA'):
                    img = img.convert('RGB')
                
                # Save to cache and stream to response
                # We use JPG for thumbnails to minimize transfer size
                img.save(cache_path, "JPEG", quality=80, optimize=True)
                
            return web.FileResponse(cache_path)
            
        except Exception as img_err:
            print(f"❌ Thumbnail generation failed: {img_err}")
            # Fallback to original file if resizing fails
            return web.FileResponse(file_path)
            
    except Exception as e:
        print(f"❌ Error in view_thumbnail: {e}")
        return web.Response(status=500, text=str(e))
