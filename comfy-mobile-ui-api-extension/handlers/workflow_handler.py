
import os
import json
from typing import Dict, List, Any, Optional
from aiohttp import web
import folder_paths
from ..utils.file_utils import get_file_info

def get_workflows_directory() -> str:
    """Get the user workflows directory path"""
    return os.path.join(folder_paths.base_path, "user", "default", "workflows")

def ensure_workflows_directory() -> str:
    """Ensure workflows directory exists and return path"""
    workflows_dir = get_workflows_directory()
    os.makedirs(workflows_dir, exist_ok=True)
    return workflows_dir

def resolve_workflow_path(relative_path: str) -> Optional[str]:
    """
    Resolve a client-supplied workflow path against the workflows directory.

    Containment is checked lexically: the path is normalised and must not climb
    out of the workflows root. Symlinks are deliberately *not* resolved away.
    This app assumes a single owner, and a symlink inside the workflows folder
    is that owner's way of pulling a shared library in - ComfyUI itself serves
    those workflows, so refusing them here would only break a legitimate setup.
    Anyone able to plant a symlink there can already read the files directly.

    Returns None when the path escapes, is absolute, or is empty.
    """
    if not relative_path:
        return None

    # Clients send POSIX separators; accept backslashes too so Windows-authored
    # paths do not silently resolve to a single oddly named file.
    candidate = relative_path.replace(os.sep, '/').replace('\\', '/').strip('/')
    if not candidate:
        return None

    if os.path.isabs(candidate) or os.path.splitdrive(candidate)[0]:
        return None

    # normpath collapses '..' textually, which is exactly the check we want:
    # it tells us where the path points relative to the root without letting a
    # symlink's target influence the verdict.
    normalised = os.path.normpath(os.path.join(*candidate.split('/')))
    if normalised.startswith(os.pardir + os.sep) or normalised == os.pardir:
        return None
    if os.path.isabs(normalised) or os.path.splitdrive(normalised)[0]:
        return None
    if normalised == os.curdir:
        return None

    return os.path.join(get_workflows_directory(), normalised)


def to_relative_workflow_path(absolute_path: str) -> str:
    """
    Path relative to the workflows directory, with POSIX separators.

    Uses the literal root rather than its real path so that entries reached
    through a symlinked directory keep the name the client asked for.
    """
    root = get_workflows_directory()
    return os.path.relpath(absolute_path, root).replace(os.sep, '/')

async def list_workflows(request):
    """List all workflow files in user/default/workflows directory"""
    try:
        workflows_dir = get_workflows_directory()
        workflows = []
        
        if os.path.exists(workflows_dir):
            # Symlinked directories are followed so that a linked-in workflow
            # library shows up, which means guarding against link cycles: a link
            # pointing at an ancestor would otherwise walk forever.
            visited_dirs = set()

            for current_dir, dir_names, file_names in os.walk(workflows_dir, followlinks=True):
                try:
                    marker = os.stat(current_dir)
                    key = (marker.st_dev, marker.st_ino)
                except OSError:
                    continue

                # st_ino is 0 on some filesystems; fall back to the real path.
                identity = key if key[1] else os.path.realpath(current_dir)
                if identity in visited_dirs:
                    dir_names[:] = []
                    continue
                visited_dirs.add(identity)

                # Skip dot-directories such as .git or editor state.
                dir_names[:] = [d for d in dir_names if not d.startswith('.')]

                for file in file_names:
                    if not file.endswith('.json'):
                        continue

                    file_path = os.path.join(current_dir, file)
                    relative_path = to_relative_workflow_path(file_path)

                    # Keeps the listing to what the content endpoint will serve.
                    if resolve_workflow_path(relative_path) is None:
                        continue

                    file_info = get_file_info(file_path)

                    workflows.append({
                        # Identifier for the content endpoint: path relative to
                        # the workflows root, POSIX separators.
                        "filename": relative_path,
                        # Split out so clients can group without re-parsing.
                        "name": file,
                        "folder": os.path.dirname(relative_path),
                        "size": file_info["size"],
                        "modified": file_info["modified"],
                        "modified_iso": file_info["modified_iso"]
                    })
        
        # Sort by modification time (newest first)
        workflows.sort(key=lambda x: x["modified"], reverse=True)
        
        return web.json_response({
            "status": "success",
            "count": len(workflows),
            "workflows": workflows
        })
        
    except Exception as e:
        return web.json_response({
            "status": "error",
            "message": str(e)
        }, status=500)

async def upload_workflow(request):
    """Upload a workflow file to the workflows directory"""
    try:
        reader = await request.multipart()
        
        workflow_file = None
        filename = None
        overwrite = False
        
        # Process multipart form data
        while True:
            field = await reader.next()
            if not field:
                break
                
            if field.name == 'file' or field.name == 'workflow':
                # Read file content
                file_content = await field.read()
                filename = field.filename or 'untitled.json'
            elif field.name == 'filename':
                filename = (await field.read()).decode('utf-8').strip()
            elif field.name == 'overwrite':
                overwrite_value = (await field.read()).decode('utf-8').strip().lower()
                overwrite = overwrite_value in ('true', '1', 'yes')
        
        if not file_content:
            return web.json_response({
                "status": "error",
                "message": "No workflow file provided"
            }, status=400)
            
        if not filename:
            filename = "untitled.json"
        
        # Security: ensure filename doesn't contain path traversal
        if '..' in filename or '/' in filename or '\\' in filename:
            return web.json_response({
                "status": "error",
                "message": "Invalid filename"
            }, status=400)
        
        # Ensure .json extension
        if not filename.endswith('.json'):
            filename += '.json'
            
        workflows_dir = ensure_workflows_directory()
        workflow_path = os.path.join(workflows_dir, filename)
        
        # Check if file exists and overwrite is not allowed
        if os.path.exists(workflow_path) and not overwrite:
            return web.json_response({
                "status": "error",
                "message": f"Workflow file '{filename}' already exists. Set overwrite=true to replace it."
            }, status=409)
        
        # Validate JSON content
        try:
            workflow_data = json.loads(file_content.decode('utf-8'))
        except json.JSONDecodeError as e:
            return web.json_response({
                "status": "error",
                "message": f"Invalid JSON content: {str(e)}"
            }, status=400)
        except UnicodeDecodeError as e:
            return web.json_response({
                "status": "error", 
                "message": f"File encoding error: {str(e)}"
            }, status=400)
        
        # Save workflow file
        with open(workflow_path, 'w', encoding='utf-8') as f:
            json.dump(workflow_data, f, indent=2, ensure_ascii=False)
        
        file_info = get_file_info(workflow_path)
        
        return web.json_response({
            "status": "success",
            "message": f"Workflow '{filename}' uploaded successfully",
            "filename": filename,
            "size": file_info["size"],
            "modified": file_info["modified"],
            "modified_iso": file_info["modified_iso"]
        })
        
    except Exception as e:
        return web.json_response({
            "status": "error",
            "message": f"Upload failed: {str(e)}"
        }, status=500)

async def get_workflow_content(request):
    """Get the content of a specific workflow file"""
    try:
        filename = request.match_info['filename']
        
        # Ensure .json extension
        if not filename.endswith('.json'):
            filename += '.json'
        
        # Workflows may live in subfolders, so containment is verified by
        # resolving the path rather than by rejecting separators outright.
        workflow_path = resolve_workflow_path(filename)
        if workflow_path is None:
            return web.json_response({
                "status": "error",
                "message": "Invalid filename"
            }, status=400)
        
        if not os.path.isfile(workflow_path):
            return web.json_response({
                "status": "error",
                "message": f"Workflow file '{filename}' not found"
            }, status=404)
        
        with open(workflow_path, 'r', encoding='utf-8') as f:
            content = json.load(f)
        
        file_info = get_file_info(workflow_path)
        
        return web.json_response({
            "status": "success",
            "filename": filename,
            "size": file_info["size"],
            "modified": file_info["modified"],
            "modified_iso": file_info["modified_iso"],
            "content": content
        })
        
    except json.JSONDecodeError as e:
        return web.json_response({
            "status": "error",
            "message": f"Invalid JSON in workflow file: {str(e)}"
        }, status=400)
    except Exception as e:
        return web.json_response({
            "status": "error", 
            "message": str(e)
        }, status=500)

async def save_workflow(request):
    """Save a workflow to the workflows directory"""
    try:
        data = await request.json()
        
        filename = data.get('filename')
        content = data.get('content')
        overwrite = data.get('overwrite', False)
        
        if not filename:
            return web.json_response({
                "status": "error",
                "message": "Filename is required"
            }, status=400)
            
        if not content:
            return web.json_response({
                "status": "error",
                "message": "Workflow content is required"
            }, status=400)
        
        # Security: ensure filename doesn't contain path traversal
        if '..' in filename or '/' in filename or '\\' in filename:
            return web.json_response({
                "status": "error",
                "message": "Invalid filename"
            }, status=400)
        
        # Ensure .json extension
        if not filename.endswith('.json'):
            filename += '.json'
            
        workflows_dir = ensure_workflows_directory()
        workflow_path = os.path.join(workflows_dir, filename)
        
        # Check if file exists and overwrite is not allowed
        if os.path.exists(workflow_path) and not overwrite:
            return web.json_response({
                "status": "error",
                "message": f"Workflow file '{filename}' already exists. Set overwrite=true to replace it."
            }, status=409)
        
        # Validate JSON content
        if isinstance(content, str):
            try:
                content = json.loads(content)
            except json.JSONDecodeError as e:
                return web.json_response({
                    "status": "error",
                    "message": f"Invalid JSON content: {str(e)}"
                }, status=400)
        
        # Save workflow file
        with open(workflow_path, 'w', encoding='utf-8') as f:
            json.dump(content, f, indent=2, ensure_ascii=False)
        
        file_info = get_file_info(workflow_path)
        
        return web.json_response({
            "status": "success",
            "message": f"Workflow '{filename}' saved successfully",
            "filename": filename,
            "size": file_info["size"],
            "modified": file_info["modified"],
            "modified_iso": file_info["modified_iso"]
        })
        
    except json.JSONDecodeError as e:
        return web.json_response({
            "status": "error",
            "message": f"Invalid JSON in request: {str(e)}"
        }, status=400)
    except Exception as e:
        return web.json_response({
            "status": "error",
            "message": str(e)
        }, status=500)

async def upload_workflow(request):
    """Upload a workflow file to the workflows directory"""
    try:
        reader = await request.multipart()
        
        workflow_file = None
        filename = None
        overwrite = False
        
        # Process multipart form data
        while True:
            field = await reader.next()
            if not field:
                break
                
            if field.name == 'file' or field.name == 'workflow':
                # Read file content
                file_content = await field.read()
                filename = field.filename or 'untitled.json'
            elif field.name == 'filename':
                filename = (await field.read()).decode('utf-8').strip()
            elif field.name == 'overwrite':
                overwrite_value = (await field.read()).decode('utf-8').strip().lower()
                overwrite = overwrite_value in ('true', '1', 'yes')
        
        if not file_content:
            return web.json_response({
                "status": "error",
                "message": "No workflow file provided"
            }, status=400)
            
        if not filename:
            filename = "untitled.json"
        
        # Security: ensure filename doesn't contain path traversal
        if '..' in filename or '/' in filename or '\\' in filename:
            return web.json_response({
                "status": "error",
                "message": "Invalid filename"
            }, status=400)
        
        # Ensure .json extension
        if not filename.endswith('.json'):
            filename += '.json'
            
        workflows_dir = ensure_workflows_directory()
        workflow_path = os.path.join(workflows_dir, filename)
        
        # Check if file exists and overwrite is not allowed
        if os.path.exists(workflow_path) and not overwrite:
            return web.json_response({
                "status": "error",
                "message": f"Workflow file '{filename}' already exists. Set overwrite=true to replace it."
            }, status=409)
        
        # Validate JSON content
        try:
            workflow_data = json.loads(file_content.decode('utf-8'))
        except json.JSONDecodeError as e:
            return web.json_response({
                "status": "error",
                "message": f"Invalid JSON content: {str(e)}"
            }, status=400)
        except UnicodeDecodeError as e:
            return web.json_response({
                "status": "error", 
                "message": f"File encoding error: {str(e)}"
            }, status=400)
        
        # Save workflow file
        with open(workflow_path, 'w', encoding='utf-8') as f:
            json.dump(workflow_data, f, indent=2, ensure_ascii=False)
        
        file_info = get_file_info(workflow_path)
        
        return web.json_response({
            "status": "success",
            "message": f"Workflow '{filename}' uploaded successfully",
            "filename": filename,
            "size": file_info["size"],
            "modified": file_info["modified"],
            "modified_iso": file_info["modified_iso"]
        })
        
    except Exception as e:
        return web.json_response({
            "status": "error",
            "message": f"Upload failed: {str(e)}"
        }, status=500)
