# ComfyUI Mobile UI API Extension
# Provides API endpoints for mobile workflow management

try:
    print("[EXTENSION] Loading ComfyUI Mobile UI API Extension...")

    # Initialize launcher service first (auto-detection)
    # Launcher will automatically host the Mobile UI and monitor ComfyUI
    from .launcher import initialize_launcher
    launcher_success = initialize_launcher()  # auto-detect all parameters

    if launcher_success:
        print("[EXTENSION] ComfyUI Mobile UI Launcher initialized with auto-detection")
    else:
        print("[EXTENSION] ComfyUI Mobile UI Launcher failed to initialize")
        print("   Auto-restart functionality may not be available")

    # Setup API routes
    from .api import setup_routes
    routes_success = setup_routes()

    # Serve the frontend bridge with no-cache: browsers partition HTTP caches
    # per top-level site, so a stale bridge module cached inside the shell's
    # iframe cannot be refreshed client-side. Registered before ComfyUI's
    # static /extensions route, so this takes precedence for our files.
    try:
        import os as _os
        from aiohttp import web as _web
        import server as _server

        _FE_DIR = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), "fe"))

        @_server.PromptServer.instance.routes.get("/extensions/comfy-mobile-ui-api-extension/{tail:.*}")
        async def _serve_bridge_fresh(request):
            tail = request.match_info["tail"]
            path = _os.path.abspath(_os.path.join(_FE_DIR, tail))
            if not path.startswith(_FE_DIR + _os.sep) or not _os.path.isfile(path):
                raise _web.HTTPNotFound()
            return _web.FileResponse(path, headers={"Cache-Control": "no-cache"})

        print("[EXTENSION] Bridge no-cache route registered")
    except Exception as _e:
        print(f"[EXTENSION] Bridge no-cache route failed: {_e}")

    if routes_success:
        print("[EXTENSION] ComfyUI Mobile UI API Extension loaded successfully!")
        if launcher_success:
            print("[EXTENSION] Launcher-powered restart functionality enabled")
    else:
        print("[EXTENSION] ComfyUI Mobile UI API Extension loaded with warnings")
        print("   API endpoints may not be available - check compatibility")

except Exception as e:
    print(f"[EXTENSION] Failed to load ComfyUI Mobile UI API Extension: {e}")
    print("   The extension is not functional")
    import traceback
    traceback.print_exc()

# ComfyUI requirements: Define dummy mappings to avoid "IMPORT FAILED" warning
# as this extension only provides API/Web functionality and no custom nodes.
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

# Frontend bridge: JS in ./fe is loaded by the official ComfyUI frontend as a
# regular extension (served at /extensions/<module_name>/). It activates only
# when the frontend runs inside the mobile shell's iframe.
WEB_DIRECTORY = "fe"