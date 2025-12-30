"""
Chain Execution Logic

Handles execution of workflow chains by:
1. Resolving input bindings (static/dynamic)
2. Submitting workflows to ComfyUI
3. Monitoring execution via WebSocket
4. Caching output files for next workflow
5. Managing execution state and progress
"""

import asyncio
import websockets
import json
import shutil
import os
import time
from typing import Dict, List, Any, Optional
from datetime import datetime

# Import ComfyUI folder_paths for path resolution
try:
    import folder_paths
    COMFY_BASE_PATH = os.path.dirname(folder_paths.__file__)
except:
    COMFY_BASE_PATH = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Hard-coded client ID for server-side execution (synchronized with mobile client)
# This ensures that events are broadcasted to the mobile client via our global hook
SERVER_CLIENT_ID = "comfy-mobile-ui-client-2025"

# Import progress manager
try:
    from .chain_progress_manager import chain_progress_manager
except ImportError:
    try:
        from chain_progress_manager import chain_progress_manager
    except ImportError:
        chain_progress_manager = None
        print("[ChainExecutor] Warning: ChainProgressManager not available")

class ChainExecutor:
    """Executes a workflow chain step by step"""

    # Class variable to track if interruption was requested
    _interrupt_requested = False

    def __init__(self, chain_data: Dict[str, Any], server_url: str = "http://127.0.0.1:8188"):
        self.chain_data = chain_data
        self.server_url = server_url.rstrip('/')
        self.ws_url = server_url.replace('http://', 'ws://').replace('https://', 'wss://').rstrip('/')
        self.execution_id = f"exec-{int(time.time() * 1000)}"
        self.output_cache: Dict[str, str] = {}  # (nodeId, outputNodeId) -> cached_path
        self.status = "pending"
        self.current_node_index = 0
        self.node_results: List[Dict[str, Any]] = []
        self.chain_id = chain_data.get('id')
        self.chain_name = chain_data.get('name', 'Unnamed Chain')

    async def execute(self) -> Dict[str, Any]:
        """Execute the entire chain"""
        try:
            self.status = "running"
            nodes = self.chain_data.get('nodes', [])

            if not nodes:
                return {
                    "success": False,
                    "error": "No workflow nodes in chain"
                }

            # Broadcast chain execution start
            if chain_progress_manager:
                await chain_progress_manager.start_chain_execution(
                    self.chain_id,
                    self.chain_name,
                    self.execution_id,
                    nodes
                )

            # Ensure chain_result folder exists
            await self._ensure_chain_result_folder()

            # Execute each workflow node in sequence
            for index, node in enumerate(nodes):
                # Check for interrupt before starting each workflow
                if self._interrupt_requested:
                    print(f"[ChainExecutor] Interrupt detected, stopping chain execution")
                    self.status = "interrupted"

                    if chain_progress_manager:
                        await chain_progress_manager.complete_chain_execution(
                            False,
                            "Chain execution interrupted by user"
                        )

                    return {
                        "success": False,
                        "executionId": self.execution_id,
                        "error": "Chain execution interrupted by user",
                        "nodeResults": self.node_results
                    }

                self.current_node_index = index

                print(f"\n[ChainExecutor] Executing workflow node {index + 1}/{len(nodes)}: {node.get('name', 'Unnamed')}")

                # Broadcast workflow start
                if chain_progress_manager:
                    await chain_progress_manager.update_workflow_status(index, 'running')

                node_result = await self._execute_workflow_node(node, index)
                self.node_results.append(node_result)

                if not node_result.get('success'):
                    self.status = "failed"

                    # Broadcast workflow failure
                    if chain_progress_manager:
                        await chain_progress_manager.update_workflow_status(
                            index,
                            'failed',
                            node_result.get('error')
                        )
                        await chain_progress_manager.complete_chain_execution(
                            False,
                            f"Workflow node {index + 1} failed: {node_result.get('error')}"
                        )

                    return {
                        "success": False,
                        "executionId": self.execution_id,
                        "error": f"Workflow node {index + 1} failed: {node_result.get('error')}",
                        "nodeResults": self.node_results
                    }

                # Broadcast workflow completion
                if chain_progress_manager:
                    await chain_progress_manager.update_workflow_status(index, 'completed')

                # Wait 10 seconds after each workflow to ensure file copy completes
                # This prevents timing issues with large files
                if index < len(nodes) - 1:  # Don't wait after last workflow
                    # Set next workflow to 'waiting' status
                    next_index = index + 1
                    if chain_progress_manager:
                        await chain_progress_manager.update_workflow_status(next_index, 'waiting')

                    print(f"[ChainExecutor] Waiting 10 seconds for file operations to complete...")
                    await asyncio.sleep(10)

            self.status = "completed"

            # Broadcast chain completion
            if chain_progress_manager:
                await chain_progress_manager.complete_chain_execution(True)

            return {
                "success": True,
                "executionId": self.execution_id,
                "status": self.status,
                "nodeResults": self.node_results
            }

        except Exception as e:
            self.status = "failed"
            print(f"[ChainExecutor] Chain execution failed: {e}")

            # Broadcast chain failure
            if chain_progress_manager:
                await chain_progress_manager.complete_chain_execution(False, str(e))

            return {
                "success": False,
                "executionId": self.execution_id,
                "error": str(e),
                "nodeResults": self.node_results
            }

    async def _execute_workflow_node(self, node: Dict[str, Any], node_index: int) -> Dict[str, Any]:
        """Execute a single workflow node"""
        try:
            node_id = node.get('id')
            node_name = node.get('name', 'Unnamed')
            api_workflow = node.get('apiFormat', {})
            input_bindings = node.get('inputBindings', {})

            if not api_workflow:
                return {
                    "success": False,
                    "nodeId": node_id,
                    "error": "No API workflow format found"
                }

            # Step 1: Resolve input bindings
            print(f"[ChainExecutor] Resolving input bindings...")
            resolved_workflow = await self._resolve_input_bindings(api_workflow, input_bindings, node_index)

            # Step 2: Submit workflow to ComfyUI
            print(f"[ChainExecutor] Submitting workflow to ComfyUI...")
            prompt_id = await self._submit_workflow(resolved_workflow)

            if not prompt_id:
                return {
                    "success": False,
                    "nodeId": node_id,
                    "error": "Failed to submit workflow"
                }

            print(f"[ChainExecutor] Workflow submitted with prompt_id: {prompt_id}")

            # Step 3: Monitor execution via WebSocket
            print(f"[ChainExecutor] Monitoring execution via WebSocket...")
            outputs = await self._monitor_workflow_execution(prompt_id, resolved_workflow)

            if not outputs:
                return {
                    "success": False,
                    "nodeId": node_id,
                    "promptId": prompt_id,
                    "error": "No outputs detected or execution failed"
                }

            # Step 4: Cache output files
            print(f"[ChainExecutor] Caching {len(outputs)} output files...")
            cached_outputs = await self._cache_output_files(outputs, node_id)

            # Step 5: Update output cache for next workflow
            for output in cached_outputs:
                cache_key = f"{node_id}.{output['nodeId']}"
                self.output_cache[cache_key] = output['cachedPath']
                print(f"[ChainExecutor] Cached output: {cache_key} -> {output['cachedPath']}")

            return {
                "success": True,
                "nodeId": node_id,
                "nodeName": node_name,
                "promptId": prompt_id,
                "outputs": cached_outputs
            }

        except Exception as e:
            print(f"[ChainExecutor] Error executing workflow node: {e}")
            return {
                "success": False,
                "nodeId": node.get('id'),
                "error": str(e)
            }

    async def _resolve_input_bindings(
        self,
        api_workflow: Dict[str, Any],
        input_bindings: Dict[str, Any],
        node_index: int
    ) -> Dict[str, Any]:
        """Resolve input bindings (replace dynamic bindings with cached paths)"""
        import copy
        resolved_workflow = copy.deepcopy(api_workflow)

        for binding_key, binding in input_bindings.items():
            # binding_key format: "nodeId.widgetName"
            parts = binding_key.split('.')
            if len(parts) != 2:
                continue

            workflow_node_id, widget_name = parts
            binding_type = binding.get('type')

            if binding_type == 'static':
                # Static binding: use value as-is
                value = binding.get('value', '')
                if workflow_node_id in resolved_workflow:
                    if 'inputs' not in resolved_workflow[workflow_node_id]:
                        resolved_workflow[workflow_node_id]['inputs'] = {}
                    resolved_workflow[workflow_node_id]['inputs'][widget_name] = value
                    print(f"[ChainExecutor] Static binding: {workflow_node_id}.{widget_name} = {value}")

            elif binding_type == 'dynamic':
                # Dynamic binding: look up cached output
                source_workflow_index = binding.get('sourceWorkflowIndex')
                source_output_node_id = binding.get('sourceOutputNodeId')

                if source_workflow_index is None or not source_output_node_id:
                    print(f"[ChainExecutor] Warning: Invalid dynamic binding for {binding_key}")
                    continue

                # Get the chain node ID from previous workflow
                if source_workflow_index >= len(self.chain_data.get('nodes', [])):
                    print(f"[ChainExecutor] Warning: Invalid source workflow index {source_workflow_index}")
                    continue

                source_node = self.chain_data['nodes'][source_workflow_index]
                source_chain_node_id = source_node.get('id')

                # Look up cached path
                cache_key = f"{source_chain_node_id}.{source_output_node_id}"
                cached_path = self.output_cache.get(cache_key)

                if cached_path:
                    if workflow_node_id in resolved_workflow:
                        if 'inputs' not in resolved_workflow[workflow_node_id]:
                            resolved_workflow[workflow_node_id]['inputs'] = {}
                        resolved_workflow[workflow_node_id]['inputs'][widget_name] = cached_path
                        print(f"[ChainExecutor] Dynamic binding: {workflow_node_id}.{widget_name} = {cached_path} (from {cache_key})")
                else:
                    print(f"[ChainExecutor] Warning: Cached path not found for {cache_key}")

        return resolved_workflow

    async def _submit_workflow(self, api_workflow: Dict[str, Any]) -> Optional[str]:
        """Submit workflow to ComfyUI /prompt endpoint"""
        import aiohttp

        try:
            payload = {
                "prompt": api_workflow,
                "client_id": SERVER_CLIENT_ID
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.server_url}/prompt",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data.get('prompt_id')
                    else:
                        error_text = await response.text()
                        print(f"[ChainExecutor] Failed to submit workflow: {response.status} - {error_text}")
                        return None
        except Exception as e:
            print(f"[ChainExecutor] Error submitting workflow: {e}")
            return None

    async def _monitor_workflow_execution(
        self,
        prompt_id: str,
        api_workflow: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Monitor workflow execution via WebSocket and extract outputs"""

        # Detect output nodes from workflow
        output_node_ids = self._detect_output_nodes(api_workflow)
        print(f"[ChainExecutor] Detected {len(output_node_ids)} output nodes: {output_node_ids}")

        if not output_node_ids:
            print(f"[ChainExecutor] Warning: No output nodes detected in workflow")
            return []

        outputs: List[Dict[str, Any]] = []
        completed_nodes = set()
        execution_failed = False
        execution_cached = False  # Track if workflow was fully cached

        try:
            ws_uri = f"{self.ws_url}/ws?clientId={SERVER_CLIENT_ID}"
            print(f"[ChainExecutor] Connecting to WebSocket: {ws_uri}")

            async with websockets.connect(ws_uri, ping_interval=20, ping_timeout=10) as websocket:
                print(f"[ChainExecutor] WebSocket connected, waiting for execution...")

                # Set a timeout for the entire execution (10 minutes)
                timeout = 600
                start_time = time.time()

                while time.time() - start_time < timeout:
                    try:
                        message = await asyncio.wait_for(websocket.recv(), timeout=5.0)

                        # Handle potential encoding issues
                        try:
                            if isinstance(message, bytes):
                                message = message.decode('utf-8', errors='replace')
                            data = json.loads(message)
                        except (UnicodeDecodeError, json.JSONDecodeError) as e:
                            print(f"[ChainExecutor] Warning: Failed to decode message: {e}")
                            continue

                        msg_type = data.get('type')
                        msg_data = data.get('data', {})

                        # Check for execution errors
                        if msg_type == 'execution_error':
                            if msg_data.get('prompt_id') == prompt_id:
                                print(f"[ChainExecutor] Execution error detected: {msg_data}")
                                execution_failed = True
                                break

                        # Check for executed messages (node completed with output)
                        elif msg_type == 'executed':
                            node_id = msg_data.get('node')
                            node_prompt_id = msg_data.get('prompt_id')

                            if node_prompt_id == prompt_id and node_id in output_node_ids:
                                output_data = msg_data.get('output', {})

                                # Extract file info from output
                                # Check for gifs/videos first (VHS nodes), then images
                                files = output_data.get('gifs') or output_data.get('images', [])

                                if files and len(files) > 0:
                                    # Use first file (index 0)
                                    file_info = files[0]
                                    outputs.append({
                                        'nodeId': node_id,
                                        'filename': file_info.get('filename'),
                                        'subfolder': file_info.get('subfolder', ''),
                                        'type': file_info.get('type', 'output')
                                    })
                                    print(f"[ChainExecutor] Captured output from node {node_id}: {file_info.get('filename')}")

                                completed_nodes.add(node_id)

                                # Check if all output nodes completed
                                if len(completed_nodes) >= len(output_node_ids):
                                    print(f"[ChainExecutor] All output nodes completed")
                                    break

                        # Check for execution_cached (all nodes cached - no execution_success will come)
                        elif msg_type == 'execution_cached':
                            cached_prompt_id = msg_data.get('prompt_id')
                            if cached_prompt_id == prompt_id:
                                print(f"[ChainExecutor] Execution cached (all nodes cached): {msg_data}")
                                execution_cached = True
                                # When fully cached, 'executed' messages may still come for output nodes
                                # Wait a bit longer for any 'executed' messages, then check 'executing' null

                        # Check for execution_success (workflow completed successfully)
                        elif msg_type == 'execution_success':
                            success_prompt_id = msg_data.get('prompt_id')
                            if success_prompt_id == prompt_id:
                                print(f"[ChainExecutor] Execution success signal received")
                                # If we already have all outputs, we can break
                                if len(completed_nodes) >= len(output_node_ids):
                                    break
                                # Otherwise continue waiting for outputs

                        # Check for executing with null node (execution finished signal)
                        elif msg_type == 'executing':
                            executing_node = msg_data.get('node')
                            if executing_node is None and msg_data.get('prompt_id') == prompt_id:
                                # Execution finished (node is null)
                                print(f"[ChainExecutor] Execution finished signal (executing null)")

                                # If execution was cached and we got executing:null, it means completion
                                if execution_cached:
                                    print(f"[ChainExecutor] Cached execution completed with {len(completed_nodes)}/{len(output_node_ids)} outputs captured")
                                    # For cached execution, we may not get all 'executed' messages
                                    # Break here to proceed with whatever outputs we have
                                    break

                                # For normal execution, only break if we have all outputs
                                if len(completed_nodes) >= len(output_node_ids):
                                    break

                    except asyncio.TimeoutError:
                        # No message in 5 seconds, continue waiting
                        continue

                if execution_failed:
                    print(f"[ChainExecutor] Workflow execution failed")
                    return []

                if time.time() - start_time >= timeout:
                    print(f"[ChainExecutor] Workflow execution timed out after {timeout} seconds")
                    return []

                # If execution was cached but we didn't get all 'executed' messages,
                # try to fetch output info from history
                if execution_cached and len(outputs) < len(output_node_ids):
                    print(f"[ChainExecutor] Attempting to fetch cached outputs from history for prompt_id: {prompt_id}")
                    history_outputs = await self._fetch_outputs_from_history(prompt_id, output_node_ids)
                    if history_outputs:
                        outputs.extend(history_outputs)
                        print(f"[ChainExecutor] Retrieved {len(history_outputs)} outputs from history")

                return outputs

        except Exception as e:
            print(f"[ChainExecutor] Error monitoring workflow: {e}")
            return []

    async def _fetch_outputs_from_history(
        self,
        prompt_id: str,
        output_node_ids: List[str]
    ) -> List[Dict[str, Any]]:
        """Fetch output information from ComfyUI history API (for cached executions)"""
        import aiohttp

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.server_url}/history/{prompt_id}",
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status != 200:
                        print(f"[ChainExecutor] Failed to fetch history: {response.status}")
                        return []

                    data = await response.json()
                    history_entry = data.get(prompt_id, {})
                    outputs_data = history_entry.get('outputs', {})

                    outputs = []
                    for node_id in output_node_ids:
                        if node_id in outputs_data:
                            output_info = outputs_data[node_id]

                            # Check for gifs/videos first (VHS nodes), then images
                            files = output_info.get('gifs') or output_info.get('images', [])

                            if files and len(files) > 0:
                                file_info = files[0]
                                outputs.append({
                                    'nodeId': node_id,
                                    'filename': file_info.get('filename'),
                                    'subfolder': file_info.get('subfolder', ''),
                                    'type': file_info.get('type', 'output')
                                })
                                print(f"[ChainExecutor] Found cached output for node {node_id}: {file_info.get('filename')}")

                    return outputs

        except Exception as e:
            print(f"[ChainExecutor] Error fetching history: {e}")
            return []

    def _detect_output_nodes(self, api_workflow: Dict[str, Any]) -> List[str]:
        """Detect output nodes (nodes with filename_prefix and save_output != false)"""
        output_nodes = []

        for node_id, node_data in api_workflow.items():
            inputs = node_data.get('inputs', {})

            # Check if node has filename_prefix
            if 'filename_prefix' in inputs:
                # Check if save_output is not explicitly false
                save_output = inputs.get('save_output', True)
                if save_output is not False:
                    output_nodes.append(str(node_id))

        return output_nodes

    async def _cache_output_files(
        self,
        outputs: List[Dict[str, Any]],
        chain_node_id: str
    ) -> List[Dict[str, Any]]:
        """Copy output files to chain_result folder"""
        cached_outputs = []

        for output in outputs:
            filename = output.get('filename')
            subfolder = output.get('subfolder', '')
            node_id = output.get('nodeId')

            if not filename:
                continue

            # Source path: outputs/{subfolder}/{filename}
            output_dir = os.path.join(COMFY_BASE_PATH, 'output')
            if subfolder:
                source_path = os.path.join(output_dir, subfolder, filename)
            else:
                source_path = os.path.join(output_dir, filename)

            # Destination: inputs/chain_result/{execution_id}_{filename}
            cached_filename = f"{self.execution_id}_{filename}"
            chain_result_dir = os.path.join(COMFY_BASE_PATH, 'input', 'chain_result')
            dest_path = os.path.join(chain_result_dir, cached_filename)

            # Relative path for ComfyUI (what goes in the workflow)
            cached_relative_path = f"chain_result/{cached_filename}"

            try:
                if os.path.exists(source_path):
                    shutil.copy2(source_path, dest_path)
                    print(f"[ChainExecutor] Cached file: {source_path} -> {dest_path}")

                    # Check if this is a video file - copy thumbnail PNG as well
                    video_extensions = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.gif']
                    file_ext = os.path.splitext(filename)[1].lower()

                    if file_ext in video_extensions:
                        # Try to copy PNG thumbnail with same name
                        filename_without_ext = os.path.splitext(filename)[0]
                        thumbnail_filename = f"{filename_without_ext}.png"

                        if subfolder:
                            thumbnail_source = os.path.join(output_dir, subfolder, thumbnail_filename)
                        else:
                            thumbnail_source = os.path.join(output_dir, thumbnail_filename)

                        thumbnail_cached_filename = f"{self.execution_id}_{thumbnail_filename}"
                        thumbnail_dest = os.path.join(chain_result_dir, thumbnail_cached_filename)

                        if os.path.exists(thumbnail_source):
                            shutil.copy2(thumbnail_source, thumbnail_dest)

                    cached_outputs.append({
                        'nodeId': node_id,
                        'filename': filename,
                        'subfolder': subfolder,
                        'originalPath': source_path,
                        'cachedPath': cached_relative_path
                    })
                else:
                    print(f"[ChainExecutor] Warning: Source file not found: {source_path}")
            except Exception as e:
                print(f"[ChainExecutor] Error caching file {filename}: {e}")

        return cached_outputs

    async def _ensure_chain_result_folder(self):
        """Ensure inputs/chain_result/ folder exists"""
        chain_result_dir = os.path.join(COMFY_BASE_PATH, 'input', 'chain_result')
        os.makedirs(chain_result_dir, exist_ok=True)
        print(f"[ChainExecutor] Ensured chain_result folder: {chain_result_dir}")

    @classmethod
    async def interrupt_execution(cls, server_url: str = "http://127.0.0.1:8188") -> Dict[str, Any]:
        """
        Interrupt currently executing chain

        Steps:
        1. Send /interrupt POST to ComfyUI to stop current prompt
        2. Set interrupt flag to stop chain execution loop
        3. Broadcast interrupted state via progress manager

        Returns:
            Dict with success status and message
        """
        import aiohttp

        try:
            print("[ChainExecutor] Interrupt requested")

            # Set interrupt flag
            cls._interrupt_requested = True

            # Send interrupt to ComfyUI
            server_url = server_url.rstrip('/')
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{server_url}/interrupt",
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status == 200:
                        print("[ChainExecutor] Interrupt signal sent to ComfyUI")
                    else:
                        error_text = await response.text()
                        print(f"[ChainExecutor] Failed to send interrupt: {response.status} - {error_text}")

            # Broadcast interrupted state via progress manager
            if chain_progress_manager:
                await chain_progress_manager.complete_chain_execution(
                    False,
                    "Chain execution interrupted by user"
                )

            print("[ChainExecutor] Chain execution interrupted")

            return {
                "success": True,
                "message": "Chain execution interrupted"
            }

        except Exception as e:
            print(f"[ChainExecutor] Error during interrupt: {e}")
            return {
                "success": False,
                "error": str(e)
            }
        finally:
            # Reset interrupt flag after a delay to allow for cleanup
            await asyncio.sleep(2)
            cls._interrupt_requested = False