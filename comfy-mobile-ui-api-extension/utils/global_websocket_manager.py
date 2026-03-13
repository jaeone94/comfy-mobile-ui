"""
Global WebSocket Manager

Responsible for:
1. Managing WebSocket connections from mobile clients
2. Hooking into ComfyUI's PromptServer to capture all events
3. Relaying captured events to all connected mobile clients
"""

import json
import asyncio
import math
from typing import Set, Dict, Any, Optional
from aiohttp import web

try:
    import server
except ImportError:
    # Fallback for development/testing without running ComfyUI
    server = None

try:
    import numpy as np
except Exception:
    np = None

class DummyWebSocket:
    """
    A dummy WebSocket object that mimics aiohttp.web.WebSocketResponse.
    It does nothing when sent messages, just satisfies ComfyUI's internal checks.
    """
    def __init__(self, client_id):
        self.client_id = client_id

    async def send_str(self, data):
        pass

    async def send_bytes(self, data):
        pass
    
    async def send_json(self, data):
        pass
    
    async def prepare(self, *args, **kwargs):
        pass

class GlobalWebSocketManager:
    _instance = None
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        
        self._initialized = True
        self.clients: Set[web.WebSocketResponse] = set()
        # Map: comfy_client_id -> real_websocket_connection (from mobile)
        self.proxy_clients: Dict[str, DummyWebSocket] = {}
        
        # Smart Buffering: Store the last message of specific types to restore state
        self.last_events: Dict[str, Any] = {}
        # Track all key lifecycle events to ensure full state restoration
        self.buffered_event_types = {
            'status', 
            'execution_start', 'execution_cached', 'executing', 'progress', 'executed', 
            'execution_success', 'execution_error', 'execution_interrupted'
        }
        
        self.lock = asyncio.Lock()
        self.original_send_sync = None
        self.original_send_bytes = None
        self._serialization_warning_cache: Set[Any] = set()
        
        print("[GlobalWS] Initializing GlobalWebSocketManager...")

    def _to_json_compatible(
        self,
        value: Any,
        depth: int = 0,
        seen: Optional[Set[int]] = None
    ) -> Any:
        """
        Convert arbitrary Python values to JSON-compatible values for WS relay.
        This affects only the mirrored mobile broadcast payload, not ComfyUI internals.
        """
        if seen is None:
            seen = set()

        if value is None or isinstance(value, (bool, int, str)):
            return value

        if isinstance(value, float):
            return value if math.isfinite(value) else None

        if np is not None and isinstance(value, np.floating):
            float_value = float(value)
            return float_value if math.isfinite(float_value) else None

        # Prevent deep/recursive structures from blowing up serialization.
        if depth > 8:
            return f"<max_depth:{type(value).__name__}>"

        object_id = id(value)
        if object_id in seen:
            return f"<recursive:{type(value).__name__}>"
        seen.add(object_id)
        try:
            if isinstance(value, dict):
                return {
                    str(k): self._to_json_compatible(v, depth + 1, seen)
                    for k, v in value.items()
                }

            if isinstance(value, (list, tuple, set)):
                return [self._to_json_compatible(v, depth + 1, seen) for v in value]

            if isinstance(value, (bytes, bytearray, memoryview)):
                return {
                    "__type__": "bytes",
                    "length": len(value)
                }

            # Handle PIL Image-like objects explicitly (common source of serializer errors).
            value_type_name = type(value).__name__
            if value_type_name == "Image":
                mode = getattr(value, "mode", None)
                size = getattr(value, "size", None)
                if isinstance(size, tuple):
                    size = list(size)
                return {
                    "__type__": "image",
                    "class": value_type_name,
                    "mode": mode,
                    "size": size
                }

            # Numpy-like arrays/scalars if available.
            if hasattr(value, "tolist") and callable(getattr(value, "tolist")):
                try:
                    return self._to_json_compatible(value.tolist(), depth + 1, seen)
                except Exception:
                    pass

            if hasattr(value, "item") and callable(getattr(value, "item")):
                try:
                    return self._to_json_compatible(value.item(), depth + 1, seen)
                except Exception:
                    pass

            # Final fallback for unknown objects.
            return str(value)
        except Exception:
            return f"<unserializable:{type(value).__name__}>"
        finally:
            seen.discard(object_id)

    def _build_json_message(self, event: Any, data: Any) -> Optional[str]:
        """
        Build a JSON message string for WS clients.
        First tries raw payload for fidelity; falls back to sanitized payload.
        """
        raw_message = {"type": event, "data": data}
        fallback_reason: Optional[str] = None
        try:
            raw_json = json.dumps(raw_message)
            if "NaN" not in raw_json and "Infinity" not in raw_json:
                return raw_json
            fallback_reason = "contains non-finite float values"
        except Exception as serialize_error:
            fallback_reason = str(serialize_error)

        cache_key = (event, type(data).__name__, fallback_reason)
        if cache_key not in self._serialization_warning_cache:
            self._serialization_warning_cache.add(cache_key)
            print(f"[GlobalWS] Falling back to safe serialization for message {event}: {fallback_reason}")

        safe_message = {
            "type": self._to_json_compatible(event),
            "data": self._to_json_compatible(data)
        }
        try:
            return json.dumps(safe_message, allow_nan=False)
        except Exception as safe_serialize_error:
            print(f"[GlobalWS] Failed to serialize message {event} after fallback: {safe_serialize_error}")
            return None

    def hook_comfyui_server(self):
        """
        Hook into ComfyUI's PromptServer to capture all events
        """
        if server is None:
            print("[GlobalWS] Server module not found, skipping hook (dev mode)")
            return

        if not hasattr(server, "PromptServer"):
            print("[GlobalWS] PromptServer not found, skipping hook")
            return

        prompt_server = server.PromptServer.instance
        self.prompt_server = prompt_server # Keep reference
        
        if self.original_send_sync is None:
            self.original_send_sync = prompt_server.send_sync
            print("[GlobalWS] Saved original send_sync method")
        
        if self.original_send_bytes is None and hasattr(prompt_server, 'send_bytes'):
            self.original_send_bytes = prompt_server.send_bytes
            print("[GlobalWS] Saved original send_bytes method")
        
        # Capture the event loop from the server object if possible, or get current
        self.loop = getattr(prompt_server, 'loop', None)
        if self.loop is None:
            try:
                self.loop = asyncio.get_event_loop()
            except RuntimeError:
                print("[GlobalWS] Warning: Could not get event loop during hook setup")

        # Define the hook method
        def hooked_send_sync(event, data, sid=None):
            # Debug log
            # print(f"[GlobalWS] 🎣 Hooked send_sync called: {event}, sid: {sid}")
            
            # 1. Capture and broadcast to our clients
            try:
                # Smart Buffering: Update last known state for key events
                if event in self.buffered_event_types:
                    # Enforce insertion order: remove existing key so the new one goes to the end
                    if event in self.last_events:
                        del self.last_events[event]
                    self.last_events[event] = data
                
                if self.loop and not self.loop.is_closed():
                    # Thread-safe scheduling to ensure it runs on the main loop
                    asyncio.run_coroutine_threadsafe(self.broadcast_event(event, data), self.loop)
                else:
                    # Fallback attempt if loop wasn't captured or is closed
                    try:
                        loop = asyncio.get_event_loop()
                        loop.create_task(self.broadcast_event(event, data))
                    except Exception:
                        print(f"[GlobalWS] Failed to schedule broadcast for {event}: no loop")
            except Exception as e:
                print(f"[GlobalWS] Error capturing event {event}: {e}")

            # 2. Delegate to original method
            if self.original_send_sync:
                try:
                    return self.original_send_sync(event, data, sid)
                except Exception as e:
                    print(f"[GlobalWS] Error in original send_sync: {e}")

        # Define the binary hook method
        def hooked_send_bytes(number, data, sid=None):
            # 1. Capture and broadcast to our clients
            try:
                if self.loop and not self.loop.is_closed():
                    asyncio.run_coroutine_threadsafe(self.broadcast_bytes(number, data), self.loop)
            except Exception as e:
                print(f"[GlobalWS] Error capturing binary event {number}: {e}")

            # 2. Delegate to original method
            if self.original_send_bytes:
                try:
                    return self.original_send_bytes(number, data, sid)
                except Exception as e:
                    print(f"[GlobalWS] Error in original send_bytes: {e}")

        # Apply the hooks
        prompt_server.send_sync = hooked_send_sync
        if self.original_send_bytes:
            prompt_server.send_bytes = hooked_send_bytes
            print("[GlobalWS] Successfully hooked into PromptServer.send_bytes")
        
        print("[GlobalWS] Successfully hooked into PromptServer.send_sync")

    async def register_proxy_client(self, client_id: str):
        """
        Register a dummy socket for the given client_id so ComfyUI thinks it's connected.
        """
        if not client_id or not self.prompt_server:
            return

        print(f"[GlobalWS] Registering proxy/dummy client for ID: {client_id}")
        
        if client_id not in self.prompt_server.sockets:
            dummy_ws = DummyWebSocket(client_id)
            self.prompt_server.sockets[client_id] = dummy_ws
            self.proxy_clients[client_id] = dummy_ws
        else:
            print(f"[GlobalWS] Client ID {client_id} already registered in ComfyUI")

    async def unregister_proxy_client(self, client_id: str):
        """
        Unregister the dummy socket.
        """
        if not client_id or not self.prompt_server:
            return

        # We generally don't want to aggressively remove if other sessions might use it?
        # But for ComfyUI logic, if socket disconnects, it's removed.
        # So we should mirror that.
        
        if client_id in self.prompt_server.sockets:
            # Only remove if it's OUR dummy socket to avoid clashing with real connections 
            # (though real connections likely wouldn't be on the same ID if we handle correctly)
            ws = self.prompt_server.sockets[client_id]
            if isinstance(ws, DummyWebSocket):
                print(f"[GlobalWS] Unregistering proxy/dummy client for ID: {client_id}")
                del self.prompt_server.sockets[client_id]
                self.proxy_clients.pop(client_id, None)

    async def add_client(self, ws: web.WebSocketResponse):
        """Add a mobile client connection"""
        async with self.lock:
            self.clients.add(ws)
            print(f"[GlobalWS] Client connected. Total mobile clients: {len(self.clients)}")
            
            # Replay buffered state to the new client
            if self.last_events:
                # print(f"[GlobalWS] Replaying {len(self.last_events)} buffered events to new client")
                try:
                    # Order matters: start -> executing -> progress -> status
                    # Though dict order is insertion-based in Py3.7+, we can just send what we have.
                    # 'status' is good to send last or first? 
                    # ComfyUI usually handles events as they come.
                    
                    # Logic: just send all buffered events
                    for event, data in self.last_events.items():
                        if event == 'execution_error':
                            continue
                        json_msg = self._build_json_message(event, data)
                        if json_msg is None:
                            continue
                        await ws.send_str(json_msg)
                except Exception as e:
                    print(f"[GlobalWS] Error replaying buffer: {e}")

    async def remove_client(self, ws: web.WebSocketResponse):
        """Remove a mobile client connection"""
        async with self.lock:
            self.clients.discard(ws)
            print(f"[GlobalWS] Client disconnected. Total mobile clients: {len(self.clients)}")

    async def broadcast_event(self, event: str, data: Any):
        """Broadcast an event to all connected clients"""
        if not self.clients:
            return

        json_msg = self._build_json_message(event, data)
        if json_msg is None:
            return

        # Broadcast to all clients
        disconnected = set()
        for ws in self.clients:
            try:
                await ws.send_str(json_msg)
            except Exception as e:
                # print(f"[GlobalWS] Error sending to client: {e}")
                disconnected.add(ws)
        
        # Cleanup disconnected clients
        if disconnected:
            async with self.lock:
                for ws in disconnected:
                    self.clients.discard(ws)

    async def broadcast_bytes(self, number: int, data: bytes):
        """Broadcast binary data to all connected clients"""
        if not self.clients:
            return

        # Prepare binary message in ComfyUI format
        # Protocol: [4-byte BIG ENDIAN type] + [data]
        import struct
        try:
            prefix = struct.pack(">I", number)
            binary_msg = prefix + data
        except Exception as e:
            print(f"[GlobalWS] Failed to prepare binary message {number}: {e}")
            return

        # Broadcast to all clients
        disconnected = set()
        for ws in self.clients:
            try:
                await ws.send_bytes(binary_msg)
            except Exception as e:
                disconnected.add(ws)
        
        # Cleanup disconnected clients
        if disconnected:
            async with self.lock:
                for ws in disconnected:
                    self.clients.discard(ws)

# Global singleton instance
global_websocket_manager = GlobalWebSocketManager()
