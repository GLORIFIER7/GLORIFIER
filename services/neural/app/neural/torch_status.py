def pytorch_status() -> dict[str, str | bool | None]:
    """Report optional PyTorch availability without making it a startup dependency."""
    try:
        import torch
    except ImportError:
        return {"installed": False, "version": None, "cuda_available": None}
    return {"installed": True, "version": str(torch.__version__),
            "cuda_available": bool(torch.cuda.is_available())}
