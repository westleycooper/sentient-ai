FROM python:3.12-slim

WORKDIR /app

RUN pip install uv

COPY pyproject.toml .
COPY ../../packages/domain /packages/domain

RUN uv pip install --system -e /packages/domain && \
    uv pip install --system -e .

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
