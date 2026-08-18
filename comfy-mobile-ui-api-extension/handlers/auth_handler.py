"""
Auth token retrieval for servers protected by ComfyUI-Login.

ComfyUI-Login prints its API token once, during startup, and otherwise only
stores it as the first line of <ComfyUI>/login/PASSWORD. Remote users who reach
ComfyUI through a browser have access to neither, which left them unable to
connect the mobile UI at all.

This endpoint hands the token to a browser session that has already
authenticated against ComfyUI-Login, so obtaining it needs nothing but the
password the user already knows.
"""

import html
import os
from aiohttp import web


def _password_path():
    """Path to ComfyUI-Login's PASSWORD file, or None when it cannot be resolved."""
    try:
        import folder_paths
    except ImportError:
        return None

    comfy_dir = os.path.dirname(folder_paths.__file__)
    return os.path.join(comfy_dir, "login", "PASSWORD")


def _read_token():
    """First line of the PASSWORD file - that line is the API token."""
    path = _password_path()
    if not path or not os.path.exists(path):
        return None

    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.readline().strip() or None
    except OSError:
        return None


async def _is_authenticated_user(request):
    """
    True only for a session that logged in with the password.

    The surrounding ComfyUI-Login middleware is deliberately not trusted on its
    own here. It lets *every* GET through for guest-mode sessions
    (`not_allowed_get_path` is empty), and it also accepts the token itself as
    credentials. Neither should be able to read the token back out, so this
    requires the logged_in flag that only a password login sets.
    """
    try:
        from aiohttp_session import get_session
    except ImportError:
        # ComfyUI-Login is not installed, so there is no session to trust.
        return False

    try:
        session = await get_session(request)
    except Exception:
        return False

    if session.get("guest_mode"):
        return False
    return session.get("logged_in") is True


_PAGE = """<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ComfyUI Mobile UI - API token</title>
<style>
  body {{ margin: 0; padding: 24px; background: #16181d; color: #e9ebef;
         font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; }}
  main {{ max-width: 560px; margin: 0 auto; }}
  h1 {{ font-size: 17px; margin: 0 0 4px; }}
  p {{ font-size: 13px; color: #8a919e; margin: 0 0 20px; }}
  .token {{ font-family: ui-monospace, monospace; font-size: 13px; word-break: break-all;
            background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.08);
            border-radius: 10px; padding: 14px; }}
  button {{ margin-top: 12px; width: 100%; min-height: 44px; font-size: 14px; font-weight: 600;
            color: #fff; background: #3069f0; border: 0; border-radius: 10px; }}
  .warn {{ margin-top: 20px; font-size: 12px; color: rgba(253,230,138,.65);
           background: rgba(251,191,36,.06); border: 1px solid rgba(251,191,36,.15);
           border-radius: 8px; padding: 12px; }}
</style>
<main>
  <h1>API token</h1>
  <p>Paste this into Server Settings &gt; Authentication in the mobile UI.</p>
  <div class="token" id="token">{token}</div>
  <button id="copy">Copy</button>
  <div class="warn">Treat this token like your password. It grants full access to this
  ComfyUI server. Use HTTPS on untrusted networks.</div>
</main>
<script>
  document.getElementById('copy').addEventListener('click', async function () {{
    var text = document.getElementById('token').textContent;
    try {{
      await navigator.clipboard.writeText(text);
      this.textContent = 'Copied';
    }} catch (e) {{
      // Clipboard API needs a secure context; plain HTTP has to select instead.
      var range = document.createRange();
      range.selectNodeContents(document.getElementById('token'));
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      this.textContent = 'Select and copy manually';
    }}
  }});
</script>
"""


async def get_auth_token(request):
    """
    GET /comfymobile/api/auth/token

    Returns the ComfyUI-Login API token to a logged-in browser session. Renders
    a copy-friendly page for browsers and JSON for programmatic callers.
    """
    wants_html = "text/html" in request.headers.get("Accept", "")

    token = _read_token()
    if token is None:
        # No ComfyUI-Login, or no password configured: there is no token to give.
        return web.json_response(
            {"error": "ComfyUI-Login is not configured on this server."}, status=404
        )

    if not await _is_authenticated_user(request):
        if wants_html:
            # Match how ComfyUI-Login sends browsers to its own login form.
            raise web.HTTPFound("/login")
        return web.json_response(
            {"error": "Log in to ComfyUI with your password to retrieve the token."},
            status=401,
        )

    if wants_html:
        return web.Response(
            text=_PAGE.format(token=html.escape(token)),
            content_type="text/html",
            headers={"Cache-Control": "no-store"},
        )

    return web.json_response({"token": token}, headers={"Cache-Control": "no-store"})
