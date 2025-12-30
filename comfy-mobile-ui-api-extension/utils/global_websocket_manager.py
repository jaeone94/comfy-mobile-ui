"""
Global WebSocket Manager

Responsible for:
1. Managing WebSocket connections from mobile clients
2. Hooking into ComfyUI's PromptServer to capture all events
3. Relaying captured events to all connected mobile clients
"""

import json
import asyncio
from typing import Set, Dict, Any, Optional
from aiohttp import web

try:
    import server
except ImportError:
    # Fallback for development/testing without running ComfyUI
    server = None

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
        
        print("[GlobalWS] Initializing GlobalWebSocketManager...")

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

        # Apply the hook
        prompt_server.send_sync = hooked_send_sync
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
                        message = {"type": event, "data": data}
                        await ws.send_str(json.dumps(message))
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

        # Prepare message in ComfyUI format
        message = {
            "type": event,
            "data": data
        }
        
        try:
            json_msg = json.dumps(message)
        except Exception as e:
            print(f"[GlobalWS] Failed to serialize message {event}: {e}")
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

# Global singleton instance
global_websocket_manager = GlobalWebSocketManager()
