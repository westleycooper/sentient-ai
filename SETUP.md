# Developer setup

## macOS / Linux

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.12+ | [python.org](https://python.org) or `pyenv install 3.12` |
| uv | 0.4+ | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Node | 20+ | [nvm](https://github.com/nvm-sh/nvm) or [nodejs.org](https://nodejs.org) |
| pnpm | 11+ | `npm install -g pnpm` or `corepack enable` |
| Docker | any | [docker.com](https://docker.com) — for local Postgres |

### 1. Clone and configure

```bash
git clone <repo-url> && cd sentient-ai
cp .env.local.example .env.local
```

Open `.env.local` and set:

```
ANTHROPIC_API_KEY=sk-ant-...    # required — get from console.anthropic.com
```

Everything else defaults to local values and can be left as-is for development.

### 2. Start Postgres

```bash
docker compose up postgres -d
```

This starts a `pgvector`-enabled Postgres on port 5432 with the credentials already in `.env.local.example`.

### 3. Install and run the API

```bash
cd apps/api
uv sync                        # install Python dependencies
uv run alembic upgrade head    # create tables (run once, and after migrations)
uv run uvicorn main:app --reload
```

API is now running at **http://localhost:8000**. Interactive docs at **http://localhost:8000/docs**.

### 4. Install and run the frontend

Open a second terminal from the repo root:

```bash
pnpm install      # install all workspace packages
cd apps/web
pnpm dev
```

Frontend is now at **http://localhost:5173**.

### 5. Try it

1. Open [http://localhost:5173](http://localhost:5173).
2. Select an SME from the dropdown (FTSE 100 Analyst, Mental Health Support, Recruitment Agent).
3. Click the mic button — type or paste text when prompted (STT is stubbed locally; see below).
4. Watch the reasoning steps appear live as LangGraph processes the turn.
5. Click the chat icon to open the transcript drawer.
6. Click the settings icon to edit SME templates, steps, and rules.

### What's stubbed in local dev

| Feature | Local behaviour | To enable for real |
|---------|---------------|--------------------|
| Speech-to-text | Returns placeholder text | Set `STT_PROVIDER=azure` + Azure Speech keys in `.env.local` |
| Text-to-speech | Returns silent audio | Set `TTS_PROVIDER=azure` or `TTS_PROVIDER=elevenlabs` + keys |
| RAG retrieval | Returns a stub chunk | Wire a `RetrievalSourcePort` adapter and configure a source via the config page |

### Running tests

```bash
# Backend — domain + application layers (≥90% coverage enforced)
cd apps/api
uv run pytest --cov

# Frontend
cd apps/web
pnpm test
```

### Useful commands

```bash
# Regenerate TypeScript types + hooks from the committed OpenAPI schema
/regen-contracts

# Check DDD layer boundaries haven't been violated
/check-boundaries

# Add a new SME template (scaffolds domain, use case, tests)
/new-sme

# Generate an Architecture Decision Record
/adr
```

---

## Windows

### Option A — WSL 2 (recommended)

WSL 2 gives you a full Linux environment with native Docker support and avoids line-ending and shell-compatibility issues.

**1. Enable WSL 2 and install Ubuntu**

Open PowerShell as Administrator:

```powershell
wsl --install
# Restart when prompted, then open the Ubuntu app to complete setup
```

If WSL is already installed, ensure you are on version 2:

```powershell
wsl --set-default-version 2
```

**2. Install Docker Desktop**

Download [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) and enable the WSL 2 backend under **Settings → Resources → WSL Integration**. Tick your Ubuntu distro.

**3. Follow the macOS / Linux instructions**

Open your Ubuntu terminal and follow the steps above — all commands are identical inside WSL 2.

> **Tip:** Clone the repo inside WSL (`~/projects/sentient-ai`), not on the Windows filesystem (`/mnt/c/...`). Filesystem performance across the WSL boundary is significantly slower.

---

### Option B — Native Windows (PowerShell)

**1. Prerequisites**

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.12+ | [python.org](https://python.org) — tick **Add to PATH** during install |
| uv | 0.4+ | `powershell -c "irm https://astral.sh/uv/install.ps1 \| iex"` |
| Node | 20+ | [nvm-windows](https://github.com/coreybutler/nvm-windows/releases) or [nodejs.org](https://nodejs.org) |
| pnpm | 11+ | `npm install -g pnpm` |
| Docker Desktop | any | [docker.com](https://docker.com) — WSL 2 backend or Hyper-V |
| Git | any | [git-scm.com](https://git-scm.com) — choose "Use Unix-style line endings" |

**2. Configure Git line endings**

```powershell
git config --global core.autocrlf false
git config --global core.eol lf
```

**3. Clone and configure**

```powershell
git clone <repo-url>
cd sentient-ai
Copy-Item .env.local.example .env.local
```

Open `.env.local` and set `ANTHROPIC_API_KEY=sk-ant-...`.

**4. Start Postgres**

```powershell
docker compose up postgres -d
```

**5. Install and run the API**

```powershell
cd apps\api
uv sync
uv run alembic upgrade head
uv run uvicorn main:app --reload
```

**6. Install and run the frontend**

Open a second terminal from the repo root:

```powershell
pnpm install
cd apps\web
pnpm dev
```

Frontend is now at **http://localhost:5173**.
