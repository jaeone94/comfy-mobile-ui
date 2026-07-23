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


def _strip_queue_item(item):
    """A queue item is [number, prompt_id, prompt_graph, extra_data,
    outputs_to_execute]. The mobile UI only reads the prompt_id (index 1) and
    the item count; the prompt graph + extra_data (which carries the full
    editor workflow for editor-queued prompts) are pure payload. Keep just
    [number, prompt_id]."""
    try:
        return [item[0], item[1]]
    except Exception:
        return item


async def get_queue_list(request):
    """Lightweight queue snapshot: running/pending prompt ids only, no prompt
    graph or workflow. Same shape as native /queue so the client parses it
    unchanged."""
    try:
        import server

        prompt_queue = server.PromptServer.instance.prompt_queue
        running, queued = prompt_queue.get_current_queue_volatile()
        return web.json_response({
            "queue_running": [_strip_queue_item(x) for x in running],
            "queue_pending": [_strip_queue_item(x) for x in queued],
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
