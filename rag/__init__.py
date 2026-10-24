"""
rag - Retrieval-Augmented Generation package for Legal Lens.
"""

# Lazy / conditional import so `python -m rag.retrieve` doesn't trigger runpy warning
def retrieve(*args, **kwargs):
    from rag.retrieve import retrieve as _retrieve
    return _retrieve(*args, **kwargs)

__all__ = ["retrieve"]
