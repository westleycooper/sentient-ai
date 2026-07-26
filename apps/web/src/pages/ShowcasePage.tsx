/**
 * ShowcasePage — the public pitch for Sentient AI at /showcase.
 *
 * A marketing/overview page rendered inside the app itself (same router, same
 * theme registry) so the showcase always reflects the product as-built:
 *   - Hero with a LIVE Three.js visualisation (not a screenshot)
 *   - Feature grid ("superpowers")
 *   - Live visualisation demo with a kind switcher + mocked reasoning stream
 *   - Theme gallery driven by the real THEMES registry (click to re-theme)
 *   - Business pitch + licence terms (free personal use, business encouraged)
 *
 * The live demos reuse the real <Waveform> component with a synthetic
 * amplitude signal — deliberately, so this page can never drift out of date
 * the way screenshots do.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  Grid,
  Link,
  Stack,
  Typography,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CloudOutlinedIcon from "@mui/icons-material/CloudOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import GitHubIcon from "@mui/icons-material/GitHub";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import InsightsIcon from "@mui/icons-material/Insights";
import QueryStatsIcon from "@mui/icons-material/QueryStats";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import RuleOutlinedIcon from "@mui/icons-material/RuleOutlined";
import SecurityOutlinedIcon from "@mui/icons-material/SecurityOutlined";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import TerminalIcon from "@mui/icons-material/Terminal";
import TuneIcon from "@mui/icons-material/Tune";

import { SentientThemeProvider } from "../themes/SentientThemeProvider";
import { THEMES, DEFAULT_THEME_ID } from "../themes/index";
import { Waveform, type WaveformKind } from "../features/waveform/Waveform";

const GITHUB_URL = "https://github.com/westleycooper/sentient-ai";

const DEMO_KINDS: { kind: WaveformKind; label: string }[] = [
  { kind: "wave", label: "Line wave" },
  { kind: "wavecircle", label: "Circle wave" },
  { kind: "wave3d", label: "3D dots" },
  { kind: "wave3dgrid", label: "3D grid" },
  { kind: "wavehead", label: "Talking head" },
];

const FEATURES = [
  {
    icon: <TuneIcon />,
    title: "Experts are configuration",
    body:
      "Each subject-matter expert is a bounded context defined as data — reasoning steps, rules, retrieval sources, lesson flows. Create a new one from the UI and it's live. No deploy, no code change.",
  },
  {
    icon: <InsightsIcon />,
    title: "Reasoning you can watch",
    body:
      "Every step of the LangGraph workflow streams to the UI as it runs — which step, its inputs and outputs, latency, and token cost. No black boxes, ever.",
  },
  {
    icon: <GraphicEqIcon />,
    title: "Voice end-to-end",
    body:
      "Speech-to-text in, multi-step reasoning with persistent Postgres context, text-to-speech out — fronted by live Three.js visualisations, from oscilloscopes to a talking head.",
  },
  {
    icon: <FactCheckOutlinedIcon />,
    title: "Answers with receipts",
    body:
      "Hybrid retrieval (vector + keyword) records provenance for every chunk it uses. Answers ship with citations, and nothing is silently truncated.",
  },
  {
    icon: <CloudOutlinedIcon />,
    title: "Runs on your cloud",
    body:
      "Cloud-agnostic core behind ports & adapters — no vendor SDK ever touches the domain. Azure Bicep included for production; Docker Compose for your laptop.",
  },
  {
    icon: <QueryStatsIcon />,
    title: "Costs you can see",
    body:
      "Token usage and estimated cost are first-class: recorded per step, per conversation, and per expert — logged, traced, and surfaced right in the UI.",
  },
];

/** Enterprise configuration powers — all wired from the UI, zero code. */
const POWER_CARDS = [
  {
    icon: <StorageOutlinedIcon />,
    title: "Your knowledge, plugged in",
    body:
      "Point an expert at any HTTP/JSON API or upload a document set — retrieval sources are configured per expert from the UI. Ingest, chunk, embed, hybrid-retrieve, rerank: the whole pipeline comes with it.",
    chips: ["HTTP APIs", "Document sets", "pgvector", "Hybrid search"],
  },
  {
    icon: <SecurityOutlinedIcon />,
    title: "Guardrails as workflow steps",
    body:
      "Drop a guardrail-check step anywhere in an expert's reasoning workflow — validated before any action, with every check recorded in the step trace. Built for what regulators now expect of AI: finance, health, legal, HR. Retrieved content and tool output are treated as untrusted, never allowed to override instructions.",
    chips: ["Regulated-industry ready", "Pre-action checks", "Prompt-injection defence", "Audit trail"],
  },
  {
    icon: <RuleOutlinedIcon />,
    title: "Rules your compliance team can read",
    body:
      "Behavioural rules are plain-language policies attached to each expert — toggleable, versioned in Postgres, enforced on every turn. \"Never give personalised financial advice\" is a row, not a redeploy.",
    chips: ["Per-expert", "Toggleable", "No redeploy"],
  },
];

/** AI-native capabilities — the platform is built BY AI tooling, FOR AI operations. */
const AI_NATIVE_CARDS = [
  {
    icon: <TerminalIcon />,
    title: "Claude Code, embedded",
    body:
      "The developer edition ships with a voice-driven Claude Code agent inside the platform: talk to it, and it reads, edits, and runs the project's own source — every action behind an approval gate. The platform that can extend itself.",
  },
  {
    icon: <HubOutlinedIcon />,
    title: "MCP server built in",
    body:
      "In the developer edition, your experts and conversations are exposed over the Model Context Protocol — Claude Desktop or any MCP client can query them directly. Your agents become tools other AI can use.",
  },
  {
    icon: <SmartToyOutlinedIcon />,
    title: "AI-native architecture",
    body:
      "Born in the agentic era: LangGraph reasoning workflows, model-agnostic LLM ports (Claude 5-ready), token accounting in every trace, and a codebase authored with AI pair-engineering from the first commit.",
  },
];

/** Mocked reasoning stream — presentational only, mirrors the live step feed. */
const MOCK_STEPS = [
  { name: "retrieve", detail: "FTSE 100 filings · 4 chunks · score ≥ 0.82", ms: 182, tokens: 1204 },
  { name: "reason", detail: "draft answer against retrieved context", ms: 941, tokens: 2317 },
  { name: "guardrail_check", detail: "no personalised financial advice", ms: 88, tokens: 310 },
  { name: "summarise", detail: "spoken-answer length target 3 sentences", ms: 402, tokens: 764 },
];

/**
 * Holds the synthetic-amplitude loop locally so its 60 Hz state updates
 * re-render only this subtree, not the whole page.
 */
function LiveWaveform({ kind, height }: { kind: WaveformKind; height: number | string }) {
  const [amplitude, setAmplitude] = useState(() => new Float32Array(256));
  const tokens = THEMES[DEFAULT_THEME_ID];

  useEffect(() => {
    let raf = 0;
    let t = 0;
    const tick = () => {
      t += 0.045;
      const buf = new Float32Array(256);
      const env = 0.3 + 0.2 * Math.sin(t * 0.9) + 0.12 * Math.sin(t * 2.3 + 1);
      for (let i = 0; i < buf.length; i++) {
        buf[i] = env * Math.sin(t * 7 + i * 0.28) * (0.55 + 0.45 * Math.sin(t * 2.1 + i * 0.02));
      }
      setAmplitude(buf);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <Box sx={{ height, width: "100%" }}>
      <Waveform
        amplitude={amplitude}
        active
        kind={kind}
        color={tokens.primary}
        peakColor={tokens.primaryLight}
        bgColor={tokens.bgDefault}
      />
    </Box>
  );
}

interface ShowcasePageProps {
  /**
   * Static-hosting mode (GitHub Pages build — see vite.showcase.config.ts).
   * There is no app or backend behind the page, so every "launch the app"
   * CTA becomes a link to the repo's Quick start instead of an in-app route.
   */
  standalone?: boolean;
}

export function ShowcasePage({ standalone = false }: ShowcasePageProps) {
  const navigate = useNavigate();
  const [themeId, setThemeId] = useState(DEFAULT_THEME_ID);
  const [demoKind, setDemoKind] = useState<WaveformKind>("wave3dgrid");

  const launchLabel = standalone ? "Run it locally" : "Launch the app";
  const launchProps = standalone
    ? { href: `${GITHUB_URL}#quick-start-already-set-up`, target: "_blank", rel: "noopener noreferrer" }
    : { onClick: () => navigate("/") };

  return (
    <SentientThemeProvider themeId={themeId}>
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default", color: "text.primary" }}>
        {/* ── Top bar ─────────────────────────────────────────────────── */}
        <Container maxWidth="lg" sx={{ py: 2 }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: "-0.02em" }}>
              Sentient AI
            </Typography>
            <Chip size="small" variant="outlined" color="primary" label="open source" />
            <Box sx={{ flex: 1 }} />
            <Button startIcon={<GitHubIcon />} href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              GitHub
            </Button>
            <Button variant="contained" startIcon={<RocketLaunchIcon />} {...launchProps}>
              {launchLabel}
            </Button>
          </Stack>
        </Container>
        <Divider />

        {/* ── Hero ────────────────────────────────────────────────────── */}
        <Container maxWidth="lg" sx={{ pt: { xs: 6, md: 10 }, pb: 4, textAlign: "center" }}>
          <Chip
            icon={<AutoAwesomeIcon />}
            label="AI-native · open source · free for personal use"
            color="primary"
            variant="outlined"
            sx={{ mb: 3 }}
          />
          <Typography variant="h2" sx={{ fontWeight: 800, letterSpacing: "-0.03em", mb: 2 }}>
            Your AI experts. Your data. Your rules.
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 820, mx: "auto", fontWeight: 400 }}>
            Sentient AI is the AI-native platform for building a roster of AI personas — each with
            its own retrieval sources, guardrails, rules, and reasoning workflow, all configured
            from one screen with no deploy. Voice in, transparent multi-step reasoning, voice out.
          </Typography>
          <Stack direction="row" spacing={2} sx={{ mt: 4, justifyContent: "center" }}>
            <Button size="large" variant="contained" startIcon={<RocketLaunchIcon />} {...launchProps}>
              {standalone ? "Run it locally" : "Try it now"}
            </Button>
            <Button size="large" variant="outlined" startIcon={<GitHubIcon />} href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              Star on GitHub
            </Button>
          </Stack>
          <Box sx={{ mt: 4, borderRadius: 2, overflow: "hidden", border: 1, borderColor: "divider" }}>
            <LiveWaveform kind="wave3dgrid" height={340} />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Live render — this is the actual visualisation component, not a screenshot.
          </Typography>
        </Container>

        {/* ── Enterprise power: RAG / guardrails / rules ──────────────── */}
        <Box sx={{ bgcolor: "background.paper", borderTop: 1, borderBottom: 1, borderColor: "divider" }}>
          <Container maxWidth="lg" sx={{ py: 6 }}>
            <Typography variant="h4" sx={{ mb: 1, textAlign: "center" }}>
              Point it at your business
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 4, textAlign: "center", maxWidth: 760, mx: "auto" }}>
              This is where the power is: an expert wired to your data, fenced by your guardrails,
              governed by your rules — all from one configuration screen, by whoever owns the domain.
            </Typography>
            <Grid container spacing={3}>
              {POWER_CARDS.map((c) => (
                <Grid key={c.title} size={{ xs: 12, md: 4 }}>
                  <Card variant="outlined" sx={{ height: "100%" }}>
                    <CardContent>
                      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 1.5, color: "primary.main" }}>
                        {c.icon}
                        <Typography variant="h6">{c.title}</Typography>
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {c.body}
                      </Typography>
                      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                        {c.chips.map((chip) => (
                          <Chip key={chip} size="small" variant="outlined" color="primary" label={chip} />
                        ))}
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* ── AI-native: Claude Code + MCP ────────────────────────────── */}
        <Container maxWidth="lg" sx={{ py: 6 }}>
          <Typography variant="h4" sx={{ mb: 1, textAlign: "center" }}>
            AI-native to the core
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 4, textAlign: "center", maxWidth: 760, mx: "auto" }}>
            Not a chatbot bolted onto old software — a platform built by AI tooling, for the agentic
            era, that other AI systems can plug straight into.
          </Typography>
          <Grid container spacing={3}>
            {AI_NATIVE_CARDS.map((c) => (
              <Grid key={c.title} size={{ xs: 12, md: 4 }}>
                <Card variant="outlined" sx={{ height: "100%" }}>
                  <CardContent>
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 1.5, color: "primary.main" }}>
                      {c.icon}
                      <Typography variant="h6">{c.title}</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {c.body}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>

        {/* ── Features ────────────────────────────────────────────────── */}
        <Container maxWidth="lg" sx={{ py: 6 }}>
          <Typography variant="h4" sx={{ mb: 1, textAlign: "center" }}>
            And everything else, standard
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 4, textAlign: "center" }}>
            Everything below ships in the open-source core. No paid tier, no gated features.
          </Typography>
          <Grid container spacing={3}>
            {FEATURES.map((f) => (
              <Grid key={f.title} size={{ xs: 12, sm: 6, md: 4 }}>
                <Card variant="outlined" sx={{ height: "100%" }}>
                  <CardContent>
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 1.5, color: "primary.main" }}>
                      {f.icon}
                      <Typography variant="h6">{f.title}</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {f.body}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>

        {/* ── Live demo ───────────────────────────────────────────────── */}
        <Container maxWidth="lg" sx={{ py: 6 }}>
          <Typography variant="h4" sx={{ mb: 1, textAlign: "center" }}>
            See it move
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3, textAlign: "center" }}>
            Every expert picks its own visualisation — switch one live. The reasoning feed beside it
            is what streams during a real conversation.
          </Typography>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 7 }}>
              <Card variant="outlined">
                <Stack direction="row" spacing={1} sx={{ p: 1.5, flexWrap: "wrap" }}>
                  {DEMO_KINDS.map((d) => (
                    <Chip
                      key={d.kind}
                      label={d.label}
                      color={demoKind === d.kind ? "primary" : "default"}
                      variant={demoKind === d.kind ? "filled" : "outlined"}
                      onClick={() => setDemoKind(d.kind)}
                    />
                  ))}
                </Stack>
                <LiveWaveform kind={demoKind} height={320} />
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 5 }}>
              <Card variant="outlined" sx={{ height: "100%" }}>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    Reasoning steps, live
                  </Typography>
                  <Stack spacing={1.5}>
                    {MOCK_STEPS.map((s) => (
                      <Box key={s.name} sx={{ p: 1.5, borderRadius: 1, border: 1, borderColor: "divider" }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                          <Chip size="small" color="primary" variant="outlined" label={s.name} />
                          <Box sx={{ flex: 1 }} />
                          <Typography variant="caption" color="text.secondary">
                            {s.ms} ms · {s.tokens.toLocaleString()} tokens
                          </Typography>
                        </Stack>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                          {s.detail}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Container>

        {/* ── Themes ──────────────────────────────────────────────────── */}
        <Container maxWidth="lg" sx={{ py: 6 }}>
          <Typography variant="h4" sx={{ mb: 1, textAlign: "center" }}>
            Bring your brand
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3, textAlign: "center" }}>
            Themes are part of the registry, selectable per expert. Click one — this page uses the
            same theme system as the app.
          </Typography>
          <Grid container spacing={3} sx={{ justifyContent: "center" }}>
            {Object.values(THEMES).map((t) => (
              <Grid key={t.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <Card
                  variant="outlined"
                  onClick={() => setThemeId(t.id)}
                  sx={{
                    cursor: "pointer",
                    borderColor: themeId === t.id ? "primary.main" : "divider",
                    borderWidth: themeId === t.id ? 2 : 1,
                  }}
                >
                  <Box sx={{ height: 90, bgcolor: t.bgDefault, display: "flex", alignItems: "center", justifyContent: "center", gap: 1 }}>
                    {[t.primary, t.primaryLight, t.primaryDark].map((c) => (
                      <Box key={c} sx={{ width: 28, height: 28, borderRadius: "50%", bgcolor: c }} />
                    ))}
                  </Box>
                  <CardContent sx={{ py: 1.5 }}>
                    <Typography variant="subtitle2">{t.label}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t.mode} mode
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>

        {/* ── Business pitch + terms ──────────────────────────────────── */}
        <Container maxWidth="md" sx={{ py: 6 }}>
          <Card variant="outlined">
            <CardContent sx={{ p: { xs: 3, md: 5 } }}>
              <Typography variant="h4" sx={{ mb: 2 }}>
                Free for personal use. Built for business.
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Sentient AI is open source and free for personal projects, learning, and research —
                forever. And if it can make your business money, even better: that's what it's for.
                Self-host it on your cloud, white-label the UI with your theme, wire in your own
                retrieval sources, and keep every token accounted for.
              </Typography>
              <Stack spacing={1} sx={{ mb: 3 }}>
                {[
                  "Stand up a new domain expert in an afternoon — it's configuration, not a project.",
                  "Guardrails, rules, and retrieval sources are config — governance changes ship without a release cycle.",
                  "Your data stays on your infrastructure; the core never phones home.",
                  "Per-conversation cost visibility from day one — finance will thank you.",
                  "Swap any provider (LLM, speech, embeddings, storage) behind a port. No lock-in.",
                ].map((line) => (
                  <Stack key={line} direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
                    <AutoAwesomeIcon color="primary" sx={{ fontSize: 18, mt: 0.4 }} />
                    <Typography variant="body2">{line}</Typography>
                  </Stack>
                ))}
              </Stack>
              <Divider sx={{ mb: 3 }} />
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Terms, in plain words
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Personal, educational, and research use is free. Commercial use is welcome and
                actively encouraged — we'd love to see Sentient AI put to work. See the repository for
                the full licence text.
              </Typography>
              <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
                <Button variant="contained" startIcon={<GitHubIcon />} href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                  Get the source
                </Button>
                <Button variant="outlined" {...launchProps}>
                  {standalone ? "Run the app locally" : "Open the live app"}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Container>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <Divider />
        <Container maxWidth="lg" sx={{ py: 3 }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <Typography variant="body2" color="text.secondary">
              Sentient AI — the open-source voice agent platform with a visible mind.
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Link href={GITHUB_URL} target="_blank" rel="noopener noreferrer" color="text.secondary" variant="body2">
              GitHub
            </Link>
            {standalone ? (
              <Link href={GITHUB_URL} target="_blank" rel="noopener noreferrer" color="text.secondary" variant="body2">
                Source
              </Link>
            ) : (
              <Link component="button" onClick={() => navigate("/")} color="text.secondary" variant="body2">
                App
              </Link>
            )}
          </Stack>
        </Container>
      </Box>
    </SentientThemeProvider>
  );
}
