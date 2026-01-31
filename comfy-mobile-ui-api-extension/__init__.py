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