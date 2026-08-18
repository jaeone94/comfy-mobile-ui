"""
Path containment tests for workflow subfolder support.

Allowing subfolders meant replacing a blanket "reject any separator" check with
resolution-based containment, so these cover what that rule used to cover for
free: traversal, absolute paths, and symlinks pointing outside the root.

Run with:  python tests/test_workflow_paths.py
"""

import importlib.util
import os
import shutil
import sys
import tempfile
import types

# The handler imports folder_paths from ComfyUI, which is not available when
# running the tests standalone. A stub is enough: only base_path is used.
_TEMP_ROOT = tempfile.mkdtemp(prefix="comfymobile-workflow-tests-")
sys.modules.setdefault("folder_paths", types.SimpleNamespace(base_path=_TEMP_ROOT))

_EXT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _load_workflow_handler():
    """
    Import the handler without importing the extension package.

    The directory name contains dashes so it is not importable directly, and
    the real __init__ boots the launcher. Synthesising the package hierarchy
    lets the handler's `from ..utils.file_utils import ...` resolve normally.
    """
    for name, path in (
        ("_cmui", _EXT_DIR),
        ("_cmui.handlers", os.path.join(_EXT_DIR, "handlers")),
        ("_cmui.utils", os.path.join(_EXT_DIR, "utils")),
    ):
        package = types.ModuleType(name)
        package.__path__ = [path]
        sys.modules[name] = package

    spec = importlib.util.spec_from_file_location(
        "_cmui.handlers.workflow_handler",
        os.path.join(_EXT_DIR, "handlers", "workflow_handler.py"),
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


_handler = _load_workflow_handler()
get_workflows_directory = _handler.get_workflows_directory
resolve_workflow_path = _handler.resolve_workflow_path
to_relative_workflow_path = _handler.to_relative_workflow_path

FAILURES = []


def check(condition, label):
    if condition:
        print("  ok   %s" % label)
    else:
        print("  FAIL %s" % label)
        FAILURES.append(label)


def main():
    workflows_dir = get_workflows_directory()
    nested_dir = os.path.join(workflows_dir, "portraits", "sdxl")
    os.makedirs(nested_dir, exist_ok=True)

    root_file = os.path.join(workflows_dir, "root.json")
    nested_file = os.path.join(nested_dir, "hires.json")
    for path in (root_file, nested_file):
        with open(path, "w", encoding="utf-8") as f:
            f.write("{}")

    outside_dir = os.path.join(_TEMP_ROOT, "outside")
    os.makedirs(outside_dir, exist_ok=True)
    secret = os.path.join(outside_dir, "secret.json")
    with open(secret, "w", encoding="utf-8") as f:
        f.write("{}")

    print("accepted paths:")
    check(resolve_workflow_path("root.json") == os.path.realpath(root_file),
          "root file")
    check(resolve_workflow_path("portraits/sdxl/hires.json") == os.path.realpath(nested_file),
          "nested file")
    check(resolve_workflow_path("/portraits/sdxl/hires.json") == os.path.realpath(nested_file),
          "leading slash is tolerated, not treated as absolute")
    check(resolve_workflow_path("portraits\\sdxl\\hires.json") == os.path.realpath(nested_file),
          "backslash separators")
    check(resolve_workflow_path("portraits/../root.json") == os.path.realpath(root_file),
          "traversal that stays inside is fine")

    print("rejected paths:")
    check(resolve_workflow_path("../outside/secret.json") is None, "parent traversal")
    check(resolve_workflow_path("portraits/../../outside/secret.json") is None,
          "traversal through a real subfolder")
    check(resolve_workflow_path(os.path.join(outside_dir, "secret.json")) is None,
          "absolute path")

    # "....//" defeats sanitisers that strip "../" textually. Resolution instead
    # treats "...." as an ordinary (nonexistent) folder name, so the result must
    # stay under the root rather than reach the file outside it.
    mangled = resolve_workflow_path("....//outside/secret.json")
    root = os.path.realpath(get_workflows_directory())
    check(mangled is None or mangled.startswith(root + os.sep),
          "mangled traversal stays inside the root")
    check(mangled != os.path.realpath(secret), "mangled traversal misses the outside file")
    check(resolve_workflow_path("") is None, "empty")
    check(resolve_workflow_path("/") is None, "root itself")
    check(resolve_workflow_path(".") is None, "dot resolves to the root")

    # A symlinked file inside the root that points outside must not be readable,
    # matching os.walk's refusal to follow symlinked directories when listing.
    link = os.path.join(workflows_dir, "linked.json")
    symlinks_supported = True
    try:
        os.symlink(secret, link)
    except (OSError, NotImplementedError, AttributeError):
        symlinks_supported = False

    if symlinks_supported:
        check(resolve_workflow_path("linked.json") is None,
              "symlink escaping the root")
    else:
        print("  skip symlink escape (not permitted on this platform)")

    print("relative path mapping:")
    check(to_relative_workflow_path(nested_file) == "portraits/sdxl/hires.json",
          "nested file maps to POSIX relative path")
    check(to_relative_workflow_path(root_file) == "root.json", "root file")

    print()
    if FAILURES:
        print("%d check(s) failed" % len(FAILURES))
        return 1
    print("all workflow path checks passed")
    return 0


if __name__ == "__main__":
    try:
        code = main()
    finally:
        shutil.rmtree(_TEMP_ROOT, ignore_errors=True)
    sys.exit(code)
