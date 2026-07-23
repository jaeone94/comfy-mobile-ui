from aiohttp import web


def _strip_entry(entry):
    """Keep only what the mobile history LIST needs.

    The native /history inlines each entry's full prompt — including
    extra_pnginfo.workflow, which for editor-queued prompts holds the whole
    workflow JSON (and any embedded base64). For a list of 100 entries that
    is megabytes the client never uses; it only reads status (timestamps,
    errors), outputs (filenames) and meta. Drop `prompt` entirely.
    """
    return {
        "outputs": entry.get("outputs", {}),
        "status": entry.get("status", {}),
        "meta": entry.get("meta", {}),
    }


async def get_history_list(request):
    """Lightweight execution-history list: metadata only, no prompt/workflow.

    Query params: max_items (optional) — returns the most recent N entries.
    Full per-entry data (workflow etc.) stays available via native
    /history/{prompt_id}, fetched on demand when a single entry is opened.
    """
    try:
        import server

        max_items = request.query.get("max_items")
        max_items = int(max_items) if max_items not in (None, "") else None

        prompt_queue = server.PromptServer.instance.prompt_queue
        # ComfyUI applies map_function while holding the history lock, so the
        # heavy prompt data is dropped before it is ever copied/serialized.
        history = prompt_queue.get_history(
            max_items=max_items, map_function=_strip_entry
        )
        return web.json_response(history)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
