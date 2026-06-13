"""Compatibility shims for third-party ML dependencies."""

from __future__ import annotations

import sys
import types

_TORCHVISION_BASICSR_APPLIED = False


def apply_torchvision_basicsr_compat() -> bool:
    """Inject a shim for removed torchvision.transforms.functional_tensor.

    basicsr<=1.4.2 imports rgb_to_grayscale from functional_tensor, but newer
    torchvision exposes it from torchvision.transforms.functional instead.
    """
    global _TORCHVISION_BASICSR_APPLIED
    if _TORCHVISION_BASICSR_APPLIED:
        return True

    module_name = "torchvision.transforms.functional_tensor"
    existing = sys.modules.get(module_name)
    if existing is not None and hasattr(existing, "rgb_to_grayscale"):
        _TORCHVISION_BASICSR_APPLIED = True
        return True

    try:
        import torchvision.transforms.functional as functional
    except ImportError:
        return False

    if not hasattr(functional, "rgb_to_grayscale"):
        return False

    shim = types.ModuleType(module_name)
    shim.rgb_to_grayscale = functional.rgb_to_grayscale
    sys.modules[module_name] = shim
    _TORCHVISION_BASICSR_APPLIED = True
    return True


def is_functional_tensor_import_error(exc: BaseException) -> bool:
    message = str(exc)
    return "functional_tensor" in message or "rgb_to_grayscale" in message


def format_basicsr_import_error(exc: BaseException) -> str:
    if is_functional_tensor_import_error(exc):
        return (
            "basicsr と torchvision の互換性問題です。"
            "torchvision.transforms.functional_tensor が見つからないため Real-ESRGAN を起動できません。"
            " 通常はサーバー起動時に自動パッチが入ります。"
            " 解決しない場合は ai-server/README.md の応急処置を参照してください。"
            f" 詳細: {exc}"
        )
    return str(exc)
