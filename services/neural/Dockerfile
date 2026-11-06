FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN useradd --create-home --uid 10001 appuser
COPY pyproject.toml uv.lock README.md ./
COPY app ./app
RUN python -m pip install --no-cache-dir --only-binary=:all: "setuptools==83.0.0" "wheel==0.45.1" \
  && python -m pip install --no-cache-dir --only-binary=:all: "uv==0.13.6" \
  && uv export --locked --extra neon --no-dev --no-emit-project --format requirements-txt --output-file /tmp/requirements.txt \
  && python -m pip install --no-cache-dir --only-binary=:all: --require-hashes -r /tmp/requirements.txt \
  && python -m pip install --no-cache-dir --no-build-isolation --no-deps . \
  && python -c "import psycopg; assert psycopg.__version__"
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)"
CMD ["uvicorn", "app.api:app", "--host", "0.0.0.0", "--port", "8000"]
