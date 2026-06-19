# Developer setup

- [macOS / Linux — with Docker](#macos--linux-with-docker) ← easiest
- [macOS / Linux — without Docker](#macos--linux-without-docker)
- [Windows — with Docker (WSL 2)](#windows--wsl-2-with-docker) ← easiest on Windows
- [Windows — without Docker (WSL 2)](#windows--wsl-2-without-docker)
- [Windows — native PowerShell (no WSL, no Docker)](#windows-native-powershell-no-wsl-no-docker)

---

## macOS / Linux — with Docker

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

## macOS / Linux — without Docker

Use this if you prefer not to run Docker, or want Postgres running as a native service.

### 1. Install PostgreSQL 16 and pgvector

**macOS (Homebrew):**

```bash
brew install postgresql@16 pgvector
brew services start postgresql@16
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zprofile
source ~/.zprofile
```

**Ubuntu / Debian:**

```bash
sudo apt install -y postgresql-16 postgresql-16-pgvector
sudo systemctl enable --now postgresql
```

**Fedora / RHEL:**

```bash
sudo dnf install -y postgresql16-server postgresql16-contrib
sudo postgresql-setup --initdb
sudo systemctl enable --now postgresql-16
# pgvector must be built from source on RHEL — see https://github.com/pgvector/pgvector
```

### 2. Create the database and user

```bash
sudo -u postgres psql <<'SQL'
CREATE USER sentinel WITH PASSWORD 'sentinel_dev';
CREATE DATABASE sentinel OWNER sentinel;
\c sentinel
CREATE EXTENSION IF NOT EXISTS vector;
SQL
```

### 3. Configure the environment

In `.env.local`, ensure:

```
DATABASE_URL=postgresql://sentinel:sentinel_dev@localhost:5432/sentinel
```

This is already the default in `.env.local.example` — no change needed if you copied it as-is.

### 4. Continue from step 3 of the Docker setup

Run the API and frontend exactly as described in [steps 3–5 above](#3-install-and-run-the-api).

---

## Windows — WSL 2 (with Docker)

### 1. Enable WSL 2 and install Ubuntu

Open PowerShell as Administrator:

```powershell
wsl --install
# Restart when prompted, then open the Ubuntu app to complete setup
wsl --set-default-version 2
```

### 2. Install Docker Desktop

Download [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) and enable the WSL 2 backend under **Settings → Resources → WSL Integration**. Tick your Ubuntu distro.

### 3. Follow the macOS / Linux (with Docker) instructions

Open your Ubuntu terminal and follow the [macOS / Linux with Docker](#macos--linux-with-docker) steps — all commands are identical inside WSL 2.

> **Tip:** Clone the repo inside WSL (`~/projects/sentient-ai`), not on the Windows filesystem (`/mnt/c/...`). Cross-boundary filesystem performance is significantly slower.

---

## Windows — WSL 2 (without Docker)

### 1. Enable WSL 2 and install Ubuntu

Same as above — run `wsl --install` in an Administrator PowerShell, restart, and complete Ubuntu setup.

### 2. Install PostgreSQL 16 and pgvector inside WSL

In your Ubuntu terminal:

```bash
sudo apt update
sudo apt install -y postgresql-16 postgresql-16-pgvector
sudo systemctl enable --now postgresql
```

### 3. Create the database and user

```bash
sudo -u postgres psql <<'SQL'
CREATE USER sentinel WITH PASSWORD 'sentinel_dev';
CREATE DATABASE sentinel OWNER sentinel;
\c sentinel
CREATE EXTENSION IF NOT EXISTS vector;
SQL
```

### 4. Follow the macOS / Linux (without Docker) steps from step 3

The rest of the setup is identical — `DATABASE_URL` defaults are already correct.

---

## Windows — native PowerShell (no WSL, no Docker)

### What you need to install

| Tool | Version | Where to get it |
|------|---------|-----------------|
| Python | 3.12+ | [python.org](https://python.org) — tick **Add to PATH** |
| uv | 0.4+ | `powershell -c "irm https://astral.sh/uv/install.ps1 \| iex"` |
| Node | 20+ | [nvm-windows](https://github.com/coreybutler/nvm-windows/releases) or [nodejs.org](https://nodejs.org) |
| pnpm | 11+ | `npm install -g pnpm` |
| PostgreSQL | 16 | [EDB installer](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads) |
| pgvector | latest | Built from source — see step 3 below (requires Visual Studio Build Tools) |
| VS Build Tools | 2022 | [visualstudio.microsoft.com](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022) — select "Desktop development with C++" |
| Git | any | [git-scm.com](https://git-scm.com) — choose "Use Unix-style line endings" |

> **Note:** pgvector has no pre-built Windows binaries — it must be compiled from source using Visual Studio. This adds meaningful setup overhead. If you are not comfortable with C build tooling, **WSL 2 is strongly recommended instead** — pgvector installs there with a single `apt` command.

### 1. Install Visual Studio Build Tools

Download [Build Tools for Visual Studio](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022) (free). During install, select **Desktop development with C++**. This provides `nmake` and the MSVC compiler needed to build pgvector.

### 2. Install PostgreSQL 16

Run the [EDB installer](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads). Note the **password** you set for the `postgres` superuser and the **port** (default 5432).

Add the Postgres bin directory to your PATH if the installer did not (adjust path as needed):

```powershell
[System.Environment]::SetEnvironmentVariable(
  "Path",
  $Env:Path + ";C:\Program Files\PostgreSQL\16\bin",
  "Machine"
)
```

Restart PowerShell after changing the PATH.

### 3. Build and install pgvector

Open the **x64 Native Tools Command Prompt for VS 2022** (search the Start menu — this sets up the MSVC environment):

```cmd
:: Download the pgvector source
curl -L https://github.com/pgvector/pgvector/archive/refs/heads/master.zip -o pgvector.zip
tar -xf pgvector.zip
cd pgvector-master

:: Point the build at your PostgreSQL installation
set "PGROOT=C:\Program Files\PostgreSQL\16"

:: Build and install
nmake /F Makefile.win
nmake /F Makefile.win install
```

You can then close the VS command prompt and return to PowerShell.

### 3. Create the database and user

```powershell
psql -U postgres -c "CREATE USER sentinel WITH PASSWORD 'sentinel_dev';"
psql -U postgres -c "CREATE DATABASE sentinel OWNER sentinel;"
psql -U postgres -d sentinel -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 4. Configure Git line endings

```powershell
git config --global core.autocrlf false
git config --global core.eol lf
```

### 5. Clone and configure

```powershell
git clone <repo-url>
cd sentient-ai
Copy-Item .env.local.example .env.local
```

Open `.env.local` and set `ANTHROPIC_API_KEY=sk-ant-...`. The `DATABASE_URL` default already matches the user/database created above.

### 6. Install and run the API

```powershell
cd apps\api
uv sync
uv run alembic upgrade head
uv run uvicorn main:app --reload
```

### 7. Install and run the frontend

Open a second terminal from the repo root:

```powershell
pnpm install
cd apps\web
pnpm dev
```

Frontend is now at **http://localhost:5173**.

