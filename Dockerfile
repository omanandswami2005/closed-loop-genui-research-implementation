# One Cloud Run image: the FastAPI loop service also serves the built frontend.

FROM node:22-slim AS frontend
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 GENUI_STATIC_DIR=/app/static
WORKDIR /app
COPY backend/pyproject.toml ./
COPY backend/closedloop ./closedloop
RUN pip install --no-cache-dir ".[service]"
COPY --from=frontend /src/dist ./static
RUN useradd --system app
USER app
CMD exec uvicorn closedloop.service:app --host 0.0.0.0 --port "${PORT:-8080}" --proxy-headers --forwarded-allow-ips "*"
