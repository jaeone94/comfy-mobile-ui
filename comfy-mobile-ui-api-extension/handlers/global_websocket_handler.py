"""
Global WebSocket Handler

Provides the WebSocket endpoint for mobile clients to receive all ComfyUI events.
WS /comfymobile/ws
"""

from aiohttp import web
from ..utils.global_websocket_manager import global_websocket_manager

async def global_websocket_handler(request):
    """
    WebSocket endpoint that relays all ComfyUI events to connected clients.
    """
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    # 1. Register client with manager
    await global_websocket_manager.add_client(ws)

    # 1.5 Register proxy client ID if provided
    client_id = request.rel_url.query.get('clientId')
    if client_id:
        await global_websocket_manager.register_proxy_client(client_id)

    try:
        # 2. Keep connection open and handle incoming messages (e.g. ping)
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                # Handle ping or potential client-to-server commands in future
                if msg.data == 'ping':
                    await ws.send_str('pong')
            elif msg.type == web.WSMsgType.ERROR:
                print(f"[GlobalWS] Connection closed with error: {ws.exception()}")
    except Exception as e:
        print(f"[GlobalWS] Unexpected error in connection: {e}")
    finally:
        # 3. Cleanup on disconnect
        await global_websocket_manager.remove_client(ws)
        if client_id:
            await global_websocket_manager.unregister_proxy_client(client_id)
    
    return ws
