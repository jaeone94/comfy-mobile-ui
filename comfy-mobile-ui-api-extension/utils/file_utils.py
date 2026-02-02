

import os
import json
import time
from typing import Dict, List, Any, Optional
from aiohttp import web
import aiohttp
import folder_paths

def extract_filename_from_content_disposition(content_disposition: str) -> str:
    """
    Extract filename from Content-Disposition header
    Supports both filename and filename* (RFC 5987) formats
    """
    import re
    import urllib.parse
    
    try:
        # Try to find filename* first (RFC 5987 - supports encoding)
        filename_star_match = re.search(r"filename\*=(?:UTF-8'')?([^;]+)", content_disposition, re.IGNORECASE)
        if filename_star_match:
            encoded_filename = filename_star_match.group(1)
            # URL decode the filename
            filename = urllib.parse.unquote(encoded_filename)
            return filename
        
        # Try to find regular filename parameter
        filename_match = re.search(r'filename=([^;]+)', content_disposition, re.IGNORECASE)
        if filename_match:
            filename = filename_match.group(1).strip()
            # Remove quotes if present
            filename = filename.strip('"\'')
            return filename
            
        return None
        
    except Exception as e:
        print(f"Error parsing Content-Disposition header: {e}")
        return None

def extract_filename_from_url(url: str) -> str:
    """
    Enhanced filename extraction from URL
    Tries multiple methods to get the best filename with proper extension
    """
    import urllib.parse
    import re
    
    try:
        parsed_url = urllib.parse.urlparse(url)
        
        # Method 1: Try to get filename from path
        path_filename = os.path.basename(parsed_url.path)
        
        # Remove query parameters and fragments from filename if they leaked in
        if '?' in path_filename:
            path_filename = path_filename.split('?')[0]
        if '#' in path_filename:
            path_filename = path_filename.split('#')[0]
            
        # Method 2: For URLs without filename in path, try to extract from query parameters
        if not path_filename or '.' not in path_filename:
            # Check common query parameters that might contain filename
            query_params = urllib.parse.parse_qs(parsed_url.query)
            
            # Common patterns for filename in query
            filename_keys = ['filename', 'file', 'name', 'download']
            for key in filename_keys:
                if key in query_params and query_params[key]:
                    potential_filename = query_params[key][0]
                    if potential_filename and '.' in potential_filename:
                        path_filename = potential_filename
                        break
        
        # Method 3: For Civitai URLs, try to extract model ID and add common extension
        if 'civitai.com' in url.lower():
            # Extract model ID from URL patterns
            model_id_match = re.search(r'/models/(\d+)', url)
            if model_id_match:
                model_id = model_id_match.group(1)
                
                # Check query for type to determine extension
                query_params = urllib.parse.parse_qs(parsed_url.query)
                file_format = query_params.get('format', [''])[0].lower()
                
                if file_format == 'safetensor':
                    extension = '.safetensors'
                elif file_format == 'pickle':
                    extension = '.ckpt'
                else:
                    extension = '.safetensors'  # Default for Civitai
                
                path_filename = f"civitai_model_{model_id}{extension}"
        
        # Method 4: If still no good filename, create one from domain
        if not path_filename or '.' not in path_filename:
            domain = parsed_url.netloc.replace('www.', '')
            timestamp = str(int(time.time()))
            path_filename = f"{domain.replace('.', '_')}_{timestamp}.bin"
        
        # Clean up filename - remove any unsafe characters
        path_filename = re.sub(r'[<>:"/\\|?*]', '_', path_filename)
        
        # Ensure filename is not empty and has reasonable length
        if len(path_filename) > 200:
            name, ext = os.path.splitext(path_filename)
            path_filename = name[:150] + ext
            
        return path_filename
        
    except Exception as e:
        print(f"Error extracting filename from URL {url}: {e}")
        # Fallback filename
        return f"download_{int(time.time())}.bin"

async def get_final_filename_from_server(url: str, fallback_filename: str = None) -> tuple[str, dict]:
    """
    Get the final filename by checking server's Content-Disposition header
    Returns (filename, response_headers)
    """
    import aiohttp
    
    try:
        timeout = aiohttp.ClientTimeout(total=30, connect=10)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            # Make HEAD request to get headers without downloading content
            async with session.head(url, allow_redirects=True) as response:
                if response.status != 200:
                    # If HEAD fails, try GET with Range header to get minimal data
                    headers = {'Range': 'bytes=0-0'}
                    async with session.get(url, headers=headers) as response:
                        if response.status not in [200, 206]:
                            raise aiohttp.ClientError(f"HTTP {response.status}: {response.reason}")
                
                # Get content type for extension detection
                content_type = response.headers.get('Content-Type', '')
                
                # Extract filename from Content-Disposition header if available
                content_disposition = response.headers.get('Content-Disposition', '')
                if content_disposition:
                    filename_from_header = extract_filename_from_content_disposition(content_disposition)
                    if filename_from_header:
                        # Clean up filename - remove any unsafe characters
                        import re
                        filename_from_header = re.sub(r'[<>:"/\\|?*]', '_', filename_from_header)
                        # Ensure proper extension
                        filename_from_header = ensure_proper_extension(filename_from_header, content_type, url)
                        print(f"📄 Server provided filename: {filename_from_header}")
                        return filename_from_header, dict(response.headers)
                
                # If no Content-Disposition, fall back to URL-based extraction
                if fallback_filename:
                    final_filename = fallback_filename
                else:
                    final_filename = extract_filename_from_url(url)
                
                # Ensure proper extension for fallback filename
                final_filename = ensure_proper_extension(final_filename, content_type, url)
                print(f"📄 Using fallback filename: {final_filename}")
                return final_filename, dict(response.headers)
                
    except Exception as e:
        print(f"Error getting filename from server: {e}")
        # Use fallback filename
        if fallback_filename:
            final_filename = fallback_filename
        else:
            final_filename = extract_filename_from_url(url)
        
        print(f"📄 Using error fallback filename: {final_filename}")
        return final_filename, {}


def detect_file_extension_from_content_type(content_type: str) -> str:
    """
    Detect appropriate file extension based on Content-Type header
    """
    content_type = content_type.lower() if content_type else ""
    
    # Common model file types
    content_type_map = {
        'application/octet-stream': '.bin',
        'application/x-pytorch': '.pth',
        'application/x-pickle': '.ckpt',
        'application/zip': '.zip',
        'application/x-tar': '.tar',
        'application/gzip': '.gz',
        'text/plain': '.txt',
        'application/json': '.json',
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/webp': '.webp',
        'video/mp4': '.mp4',
        'video/webm': '.webm',
    }
    
    for mime_type, ext in content_type_map.items():
        if mime_type in content_type:
            return ext
    
    # Default for unknown types
    return '.bin'


def ensure_proper_extension(filename: str, content_type: str = None, url: str = None) -> str:
    """
    Ensure filename has a proper extension based on content type, URL, or defaults
    """
    import os

    # Check if filename already has an extension-like pattern
    if filename and '.' in filename:
        name, ext = os.path.splitext(filename)
        # If extension exists and has no whitespace, consider it valid
        if ext and not any(c.isspace() for c in ext):
            return filename  # Already has a valid extension pattern
    
    # Try to detect extension from Content-Type
    if content_type:
        detected_ext = detect_file_extension_from_content_type(content_type)
        if detected_ext != '.bin':  # Only use if we detected something specific
            return filename + detected_ext
    
    # Try to detect from URL patterns
    if url:
        url_lower = url.lower()
        
        # Check for common patterns in URLs
        if 'safetensors' in url_lower or 'format=safetensor' in url_lower:
            return filename + '.safetensors'
        elif 'ckpt' in url_lower or 'format=pickle' in url_lower:
            return filename + '.ckpt'
        elif 'pytorch' in url_lower or '.pth' in url_lower:
            return filename + '.pth'
        elif 'civitai.com' in url_lower:
            return filename + '.safetensors'  # Civitai default
        elif 'huggingface.co' in url_lower:
            return filename + '.safetensors'  # HuggingFace default
    
    # Default extension for model files
    return filename + '.bin'


def get_file_info(file_path: str) -> Dict[str, Any]:
    """Get file information including size and modification time"""
    try:
        stat = os.stat(file_path)
        return {
            "size": stat.st_size,
            "modified": stat.st_mtime,
            "modified_iso": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(stat.st_mtime))
        }
    except OSError:
        return {
            "size": 0,
            "modified": 0,
            "modified_iso": "1970-01-01T00:00:00Z"
        }


def scan_directory_recursive(base_path: str, folder_type: str) -> List[Dict[str, Any]]:
    """Recursively scan directory for files with subfolder information"""
    files = []
    
    if not os.path.exists(base_path):
        return files
    
    try:
        for root, dirs, filenames in os.walk(base_path):
            # Filter hidden directories to prevent scanning cache folders like .mobile_thumbnails
            dirs[:] = [d for d in dirs if not d.startswith('.')]
            
            # Calculate relative subfolder path
            rel_path = os.path.relpath(root, base_path)
            subfolder = "" if rel_path == "." else rel_path.replace(os.sep, "/")
            
            for filename in filenames:
                # Skip hidden files and system files
                if filename.startswith('.') or filename.startswith('__'):
                    continue
                
                # Skip .json files (ComfyUI auto-generated files)
                if filename.lower().endswith('.json'):
                    continue
                    
                file_path = os.path.join(root, filename)
                file_info = get_file_info(file_path)
                
                # Determine file extension and category
                ext = filename.split('.')[-1].lower() if '.' in filename else ''
                
                file_data = {
                    "filename": filename,
                    "subfolder": subfolder,
                    "type": folder_type,
                    "extension": ext,
                    "size": file_info["size"],
                    "modified": file_info["modified"],
                    "modified_iso": file_info["modified_iso"],
                    "path": file_path
                }
                
                files.append(file_data)
                
    except Exception as e:
        print(f"Error scanning directory {base_path}: {e}")
    
    return files


def categorize_files(files: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """Categorize files by type (images, videos, other)"""
    categorized = {
        "images": [],
        "videos": [],
        "files": []
    }
    
    image_extensions = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tiff', 'tga'}
    video_extensions = {'mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'm4v', 'wmv'}
    
    for file_data in files:
        ext = file_data.get('extension', '').lower()
        
        # Remove path from response for security
        file_response = {k: v for k, v in file_data.items() if k != 'path'}
        
        if ext in image_extensions:
            categorized["images"].append(file_response)
        elif ext in video_extensions:
            categorized["videos"].append(file_response)
        else:
            categorized["files"].append(file_response)
    
    return categorized

def validate_filename(filename: str) -> bool:
    """Validate filename to prevent path traversal attacks"""
    if not filename:
        return False
    if '..' in filename or '/' in filename or '\\' in filename:
        return False
    if filename.startswith('.'):
        return False
    return True

def build_file_path(folder_type: str, filename: str, subfolder: str = "") -> str:
    """Build absolute file path from components"""
    # Import get_folder_path from file_handler to avoid circular imports
    from ..handlers.file_handler import get_folder_path
    base_path = get_folder_path(folder_type)
    
    if subfolder:
        # Validate subfolder for security
        if '..' in subfolder or subfolder.startswith('/') or subfolder.startswith('\\'):
            raise ValueError(f"Invalid subfolder: {subfolder}")
        file_path = os.path.join(base_path, subfolder, filename)
    else:
        file_path = os.path.join(base_path, filename)
    
    # Ensure the file is within the expected directory
    if not file_path.startswith(base_path):
        raise ValueError("File path outside of allowed directory")
    
    return file_path

def is_video_file(filename: str) -> bool:
    """Check if a file is a video file based on extension"""
    ext = filename.split('.')[-1].lower() if '.' in filename else ''
    return ext in ['mp4', 'avi', 'mov', 'mkv', 'webm']

def find_matching_thumbnail(video_filename: str, folder_type: str, subfolder: str = "") -> str:
    """Find matching image thumbnail for a video file in the same folder/subfolder"""
    # Get video filename without extension
    video_name_without_ext = video_filename.rsplit('.', 1)[0]
    
    # Remove -audio suffix if present
    if video_name_without_ext.endswith('-audio'):
        video_name_without_ext = video_name_without_ext[:-6]  # Remove '-audio'
    
    # Image extensions to look for
    image_extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp']
    
    # Build the base directory path
    # Import get_folder_path from file_handler to avoid circular imports
    from ..handlers.file_handler import get_folder_path
    base_path = get_folder_path(folder_type)
    search_dir = os.path.join(base_path, subfolder) if subfolder else base_path
    
    if not os.path.exists(search_dir):
        return None
    
    # Look for matching image files
    try:
        for file in os.listdir(search_dir):
            if os.path.isfile(os.path.join(search_dir, file)):
                file_name_without_ext = file.rsplit('.', 1)[0]
                file_ext = file.split('.')[-1].lower() if '.' in file else ''
                
                if file_name_without_ext == video_name_without_ext and file_ext in image_extensions:
                    return file
    except (OSError, PermissionError):
        pass
    
    return None


