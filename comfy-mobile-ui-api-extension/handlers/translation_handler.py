"""Cloud and optional offline translation handlers."""

import json

import aiohttp
from aiohttp import web

from ..utils.local_translation_service import (
    LocalTranslationError,
    get_local_translation_status,
    install_local_translation_pairs,
    start_local_translation_engine_install,
    translate_locally,
)


LANGUAGE_NAMES = {
    "EN": "English",
    "KO": "Korean",
    "JA": "Japanese",
    "ZH": "Chinese",
    "DE": "German",
    "FR": "French",
    "ES": "Spanish",
    "IT": "Italian",
    "PT": "Portuguese",
    "RU": "Russian",
    "ZH-HANS": "Simplified Chinese",
}

SUPPORTED_SOURCES = {"auto", "EN", "KO", "JA", "ZH", "DE", "FR", "ES", "IT", "PT", "RU"}
SUPPORTED_TARGETS = {"EN", "ZH-HANS", "KO", "JA", "DE", "FR", "ES", "IT", "PT", "RU"}
MAX_TEXT_LENGTH = 30_000


def _provider_error(payload, status):
    message = None
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            message = error.get("message")
        elif isinstance(error, str):
            message = error
        message = message or payload.get("message")
    return web.json_response(
        {"error": message or f"Translation provider returned HTTP {status}."},
        status=status if 400 <= status < 500 else 502,
    )


async def _translate_with_deepl(session, api_key, text, source_language, target_language):
    endpoint = "https://api-free.deepl.com/v2/translate" if api_key.endswith(":fx") else "https://api.deepl.com/v2/translate"
    body = {
        "text": [text],
        "target_lang": "PT-PT" if target_language == "PT" else target_language,
        "preserve_formatting": True,
    }
    if source_language != "auto":
        body["source_lang"] = source_language

    async with session.post(
        endpoint,
        headers={"Authorization": f"DeepL-Auth-Key {api_key}"},
        json=body,
    ) as response:
        payload = await response.json(content_type=None)
        if not response.ok:
            return _provider_error(payload, response.status)

        translations = payload.get("translations", [])
        if not translations:
            return web.json_response({"error": "DeepL returned no translation."}, status=502)

        translation = translations[0]
        return web.json_response({
            "text": translation.get("text", ""),
            "detected_source_language": translation.get("detected_source_language"),
        })


async def _translate_with_groq(session, api_key, text, source_language, target_language):
    source_instruction = (
        "Detect the source language automatically"
        if source_language == "auto"
        else f"The source language is {LANGUAGE_NAMES[source_language]}"
    )
    target_name = LANGUAGE_NAMES[target_language]
    system_prompt = (
        "You are a precise translation engine. "
        f"{source_instruction}. Translate the user's text into {target_name}. "
        "Preserve line breaks, punctuation, comma-separated structure, markup, and parameter syntax. "
        "Return only the translated text without quotes, notes, or explanations."
    )

    body = {
        "model": "qwen/qwen3.6-27b",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text},
        ],
        "temperature": 0.1,
        "reasoning_effort": "none",
    }

    async with session.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}"},
        json=body,
    ) as response:
        payload = await response.json(content_type=None)
        if not response.ok:
            return _provider_error(payload, response.status)

        try:
            translated_text = payload["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError, TypeError, AttributeError):
            return web.json_response({"error": "Groq returned no translation."}, status=502)

        return web.json_response({
            "text": translated_text,
            "detected_source_language": None,
        })


async def translate_text(request):
    """Proxy a translation request without persisting or logging its API key or text."""
    try:
        body = await request.json()
    except (json.JSONDecodeError, ValueError):
        return web.json_response({"error": "Invalid JSON request."}, status=400)

    provider = str(body.get("provider", "")).lower()
    api_key = str(body.get("api_key", "")).strip()
    text = str(body.get("text", ""))
    source_language = str(body.get("source_language", "auto")).upper()
    if source_language == "AUTO":
        source_language = "auto"
    target_language = str(body.get("target_language", "EN")).upper()

    if provider not in {"groq", "deepl", "argos"}:
        return web.json_response({"error": "Unsupported translation provider."}, status=400)
    if provider != "argos" and not api_key:
        return web.json_response({"error": "An API key is required."}, status=400)
    if not text.strip():
        return web.json_response({"error": "Text is required."}, status=400)
    if len(text) > MAX_TEXT_LENGTH:
        return web.json_response({"error": f"Text exceeds the {MAX_TEXT_LENGTH:,} character limit."}, status=400)
    if source_language not in SUPPORTED_SOURCES:
        return web.json_response({"error": "Unsupported source language."}, status=400)
    if target_language not in SUPPORTED_TARGETS:
        return web.json_response({"error": "Unsupported target language."}, status=400)

    if provider == "argos":
        try:
            translated_text, detected_source = await translate_locally(
                text, source_language, target_language
            )
            return web.json_response({
                "text": translated_text,
                "detected_source_language": detected_source,
            })
        except LocalTranslationError as error:
            return web.json_response({
                "error": str(error),
                "code": error.code,
                "required_pairs": error.required_pairs,
                "detected_source_language": error.detected_source_language,
            }, status=409 if error.code == "LANGUAGE_PACK_MISSING" else 503)

    timeout = aiohttp.ClientTimeout(total=40, connect=10)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            if provider == "deepl":
                return await _translate_with_deepl(
                    session, api_key, text, source_language, target_language
                )
            return await _translate_with_groq(
                session, api_key, text, source_language, target_language
            )
    except aiohttp.ClientError:
        return web.json_response({"error": "Could not reach the translation provider."}, status=502)
    except TimeoutError:
        return web.json_response({"error": "The translation provider timed out."}, status=504)


async def local_translation_status(_request):
    return web.json_response(await get_local_translation_status())


async def install_local_translation_engine(_request):
    started, state = await start_local_translation_engine_install()
    return web.json_response({
        "started": started,
        "engine_install": state,
    }, status=202 if started else 200)


async def install_local_translation_packages(request):
    try:
        body = await request.json()
        pairs = body.get("pairs", [])
        if not isinstance(pairs, list):
            raise ValueError
    except (json.JSONDecodeError, ValueError):
        return web.json_response({"error": "Invalid JSON request."}, status=400)

    try:
        installed_now, installed_pairs = await install_local_translation_pairs(pairs)
        return web.json_response({
            "installed_now": installed_now,
            "installed_pairs": installed_pairs,
        })
    except LocalTranslationError as error:
        return web.json_response({
            "error": str(error),
            "code": error.code,
            "required_pairs": error.required_pairs,
        }, status=503 if error.code == "LOCAL_ENGINE_MISSING" else 400)
    except Exception as error:
        print(f"[ComfyMobileUI] Argos package installation failed: {error}")
        return web.json_response({"error": "Could not install the local language pack."}, status=500)
