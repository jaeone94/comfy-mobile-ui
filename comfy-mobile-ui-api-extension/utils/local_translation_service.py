"""Optional offline translation support backed by Argos Translate."""

import asyncio
import importlib
import os
import re
import sys
import time
from pathlib import Path


SUPPORTED_LANGUAGE_CODES = ("en", "ko", "ja", "zh", "de", "fr", "es", "it", "pt", "ru")
_translation_lock = asyncio.Lock()
_package_lock = asyncio.Lock()
_engine_install_lock = asyncio.Lock()
_engine_install_task = None
_argos_modules = None
_argos_import_error = None
_engine_install_state = {
    "state": "idle",
    "message": None,
    "error": None,
    "restart_required": False,
    "started_at": None,
    "finished_at": None,
}


class LocalTranslationError(RuntimeError):
    """An expected local-translation setup or execution error."""

    def __init__(self, code, message, *, required_pairs=None, detected_source_language=None):
        super().__init__(message)
        self.code = code
        self.required_pairs = required_pairs or []
        self.detected_source_language = detected_source_language


def _packages_directory():
    configured = (
        os.environ.get("COMFY_MOBILE_ARGOS_PACKAGES_DIR")
        or os.environ.get("ARGOS_PACKAGES_DIR")
    )
    if configured:
        path = Path(configured).expanduser().resolve()
    else:
        try:
            import folder_paths

            path = Path(folder_paths.get_user_directory()) / "comfy-mobile-ui" / "argos" / "packages"
        except (ImportError, AttributeError):
            path = Path.home() / ".comfy-mobile-ui" / "argos" / "packages"

    path.mkdir(parents=True, exist_ok=True)
    return path


def _load_argos():
    global _argos_modules, _argos_import_error
    if _argos_modules is not None:
        return _argos_modules
    if _argos_import_error is not None:
        raise _argos_import_error

    # Argos reads these values while importing its settings module.
    os.environ.setdefault("ARGOS_PACKAGES_DIR", str(_packages_directory()))
    os.environ.setdefault("ARGOS_DEVICE_TYPE", "cpu")
    os.environ.setdefault("ARGOS_COMPUTE_TYPE", "int8")

    try:
        from argostranslate import package, translate

        _argos_modules = (package, translate)
        return _argos_modules
    except (ImportError, OSError) as error:
        _argos_import_error = error
        raise


def _reset_argos_import_state():
    global _argos_modules, _argos_import_error
    importlib.invalidate_caches()
    _argos_modules = None
    _argos_import_error = None


def _engine_install_snapshot():
    return dict(_engine_install_state)


def _local_requirements_file():
    return Path(__file__).resolve().parent.parent / "requirements-local-translation.txt"


async def _run_engine_install():
    requirements_file = _local_requirements_file()
    output_tail = []
    try:
        if not requirements_file.is_file():
            raise RuntimeError("Local translation requirements file is missing.")

        process = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            "-r",
            str(requirements_file),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        while True:
            line = await process.stdout.readline()
            if not line:
                break
            text = line.decode("utf-8", errors="replace").strip()
            if text:
                print(f"[ComfyMobileUI][Argos install] {text}")
                output_tail.append(text)
                del output_tail[:-20]

        return_code = await process.wait()
        if return_code != 0:
            details = "\n".join(output_tail[-8:])
            raise RuntimeError(details or f"pip exited with code {return_code}.")

        _reset_argos_import_state()
        try:
            await asyncio.to_thread(_installed_pairs_sync)
        except (ImportError, OSError) as error:
            _engine_install_state.update({
                "state": "restart_required",
                "message": "Installation completed, but ComfyUI must be restarted to load Argos.",
                "error": str(error),
                "restart_required": True,
                "finished_at": time.time(),
            })
            return

        _engine_install_state.update({
            "state": "succeeded",
            "message": "Argos local translation engine installed successfully.",
            "error": None,
            "restart_required": False,
            "finished_at": time.time(),
        })
    except Exception as error:
        _reset_argos_import_state()
        _engine_install_state.update({
            "state": "failed",
            "message": "Argos local translation engine installation failed.",
            "error": str(error),
            "restart_required": False,
            "finished_at": time.time(),
        })
        print(f"[ComfyMobileUI] Argos engine installation failed: {error}")


async def start_local_translation_engine_install():
    """Start a fixed, optional dependency installation in the background."""
    global _engine_install_task
    async with _engine_install_lock:
        if _engine_install_task is not None and not _engine_install_task.done():
            return False, _engine_install_snapshot()

        _engine_install_state.update({
            "state": "running",
            "message": "Installing Argos local translation engine...",
            "error": None,
            "restart_required": False,
            "started_at": time.time(),
            "finished_at": None,
        })
        _engine_install_task = asyncio.create_task(_run_engine_install())
        return True, _engine_install_snapshot()


def _installed_pairs_sync():
    package, _ = _load_argos()
    return sorted({
        f"{item.from_code}-{item.to_code}"
        for item in package.get_installed_packages()
    })


def _optional_module_available(module_name):
    try:
        __import__(module_name)
        return True
    except (ImportError, OSError):
        return False


async def get_local_translation_status():
    """Return availability without making the extension depend on Argos."""
    try:
        installed_pairs = await asyncio.to_thread(_installed_pairs_sync)
        engine_available = True
        engine_error = None
    except (ImportError, OSError) as error:
        installed_pairs = []
        engine_available = False
        engine_error = str(error)

    return {
        "engine_available": engine_available,
        "engine_error": engine_error,
        "detector_available": _optional_module_available("lingua"),
        "simplifier_available": _optional_module_available("opencc"),
        "packages_directory": str(_packages_directory()),
        "installed_pairs": installed_pairs,
        "supported_languages": list(SUPPORTED_LANGUAGE_CODES),
        "engine_install": _engine_install_snapshot(),
    }


def required_translation_pairs(source_language, target_language):
    """Return the explicit Argos route used by the app."""
    source = source_language.lower()
    target = target_language.lower()
    if source == target:
        return []
    if target == "en":
        return [f"{source}-en"]
    if target not in SUPPORTED_LANGUAGE_CODES:
        raise LocalTranslationError("UNSUPPORTED_LANGUAGE", "Unsupported local translation target.")
    return [f"en-{target}"] if source == "en" else [f"{source}-en", f"en-{target}"]


def _detect_language_sync(text):
    # Script-specific checks improve reliability for short prompt fragments.
    if re.search(r"[\uac00-\ud7a3]", text):
        return "ko"
    if re.search(r"[\u3040-\u30ff]", text):
        return "ja"
    if re.search(r"[\u0400-\u04ff]", text):
        return "ru"
    if re.search(r"[\u3400-\u9fff]", text):
        return "zh"

    try:
        from lingua import Language, LanguageDetectorBuilder
    except (ImportError, OSError) as error:
        raise LocalTranslationError(
            "LOCAL_DETECTOR_MISSING",
            "Automatic language detection requires lingua-language-detector.",
        ) from error

    languages = [
        Language.ENGLISH,
        Language.GERMAN,
        Language.FRENCH,
        Language.SPANISH,
        Language.ITALIAN,
        Language.PORTUGUESE,
    ]
    detector = (
        LanguageDetectorBuilder.from_languages(*languages)
        .with_minimum_relative_distance(0.05)
        .build()
    )
    detected = detector.detect_language_of(text)
    if detected is None:
        raise LocalTranslationError(
            "LANGUAGE_UNCERTAIN",
            "The source language could not be detected reliably. Select it manually.",
        )
    return detected.iso_code_639_1.name.lower()


def _translate_pair_sync(text, source, target):
    _, translate = _load_argos()
    installed_languages = {language.code: language for language in translate.get_installed_languages()}
    source_language = installed_languages.get(source)
    target_language = installed_languages.get(target)
    if source_language is None or target_language is None:
        raise LocalTranslationError("LANGUAGE_PACK_MISSING", "A required local language pack is missing.")

    translation = source_language.get_translation(target_language)
    if translation is None:
        raise LocalTranslationError("LANGUAGE_PACK_MISSING", "A required local language pack is missing.")
    return translation.translate(text)


def _simplify_chinese_sync(text):
    try:
        from opencc import OpenCC

        return OpenCC("t2s").convert(text)
    except (ImportError, OSError):
        # The official en->zh package normally emits Simplified Chinese already.
        return text


async def translate_locally(text, source_language, target_language):
    """Translate on CPU and serialize model execution to limit memory spikes."""
    try:
        _load_argos()
    except (ImportError, OSError) as error:
        raise LocalTranslationError(
            "LOCAL_ENGINE_MISSING",
            "Argos Translate is not installed in the ComfyUI Python environment.",
        ) from error

    source = source_language.lower()
    if source == "auto":
        source = await asyncio.to_thread(_detect_language_sync, text)
    target = "zh" if target_language.upper() == "ZH-HANS" else target_language.lower()
    required_pairs = required_translation_pairs(source, target)
    installed_pairs = set(await asyncio.to_thread(_installed_pairs_sync))
    missing_pairs = [pair for pair in required_pairs if pair not in installed_pairs]
    if missing_pairs:
        raise LocalTranslationError(
            "LANGUAGE_PACK_MISSING",
            "Required local language packs are not installed.",
            required_pairs=missing_pairs,
            detected_source_language=source.upper(),
        )

    async with _translation_lock:
        translated = text
        current = source
        for pair in required_pairs:
            pair_source, pair_target = pair.split("-", 1)
            if current != pair_source:
                raise LocalTranslationError("TRANSLATION_FAILED", "Invalid local translation route.")
            translated = await asyncio.to_thread(_translate_pair_sync, translated, pair_source, pair_target)
            current = pair_target
        if target == "zh":
            translated = await asyncio.to_thread(_simplify_chinese_sync, translated)

    return translated, source.upper()


def _install_pairs_sync(pairs):
    package, translate = _load_argos()
    package.update_package_index()
    available = {
        f"{item.from_code}-{item.to_code}": item
        for item in package.get_available_packages()
    }
    installed = set(_installed_pairs_sync())
    installed_now = []
    unavailable = []
    for pair in pairs:
        if pair in installed:
            continue
        package_item = available.get(pair)
        if package_item is None:
            unavailable.append(pair)
            continue
        package.install_from_path(package_item.download())
        installed_now.append(pair)

    translate.get_installed_languages.cache_clear()
    if unavailable:
        raise LocalTranslationError(
            "LANGUAGE_PACK_UNAVAILABLE",
            f"No Argos package is available for: {', '.join(unavailable)}.",
            required_pairs=unavailable,
        )
    return installed_now, _installed_pairs_sync()


async def install_local_translation_pairs(pairs):
    normalized = []
    for pair in pairs:
        value = str(pair).strip().lower()
        if not re.fullmatch(r"[a-z]{2}-[a-z]{2}", value):
            raise LocalTranslationError("INVALID_LANGUAGE_PACK", "Invalid language-pack identifier.")
        source, target = value.split("-", 1)
        if source not in SUPPORTED_LANGUAGE_CODES or target not in SUPPORTED_LANGUAGE_CODES:
            raise LocalTranslationError("INVALID_LANGUAGE_PACK", "Unsupported language-pack identifier.")
        if value not in normalized:
            normalized.append(value)

    if not normalized:
        return [], await asyncio.to_thread(_installed_pairs_sync)

    try:
        _load_argos()
    except (ImportError, OSError) as error:
        raise LocalTranslationError(
            "LOCAL_ENGINE_MISSING",
            "Argos Translate is not installed in the ComfyUI Python environment.",
        ) from error

    async with _package_lock:
        return await asyncio.to_thread(_install_pairs_sync, normalized)
