"""Cloudflare Python Worker entrypoint for the Neural FastAPI service."""

import logging

logging.basicConfig(level=logging.WARNING)

# Load and validate the Pyodide-compatible driver during Worker startup.
import asyncpg

if not callable(asyncpg.connect):
    raise TypeError("Cloudflare asyncpg driver is unavailable")

from workers import asgi

from app.api import app

# Cloudflare's Python Worker runtime supplies the ASGI server and request env scope.
Default = asgi.entrypoint(app)
