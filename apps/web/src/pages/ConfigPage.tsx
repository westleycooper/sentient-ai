/**
 * ConfigPage — single-page SME configuration.
 *
 * Left panel: template cards (select/clone).
 * Right panel: full editor for the selected template.
 * CLAUDE.md §6: all SME config on one page.
 */
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  AppBar,
  Box,
  Button,
  CircularProgress,
  Grid,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";

import { SmeTemplateCard } from "../features/config/SmeTemplateCard";
import { SmeEditor } from "../features/config/SmeEditor";
import { AgentConfigEditor } from "../features/agent/AgentConfigEditor";
import {
  useSmeTemplates,
  useSaveSmeTemplate,
  useDeleteSmeTemplate,
  type SmeTemplate,
} from "../api/hooks";
import { useUiStore } from "../store/uiStore";

export function ConfigPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: templates = [], isLoading } = useSmeTemplates();
  const saveMutation = useSaveSmeTemplate();
  const deleteMutation = useDeleteSmeTemplate();
  const { defaultSmeId, setDefaultSme } = useUiStore();

  const [tab, setTab] = useState(() => {
    const t = Number(searchParams.get("tab"));
    return Number.isFinite(t) && t >= 0 ? t : 0;
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; severity: "success" | "error" } | null>(null);

  const selected = templates.find((t) => t.id === selectedId) ?? templates[0] ?? null;

  const handleSave = async (t: SmeTemplate) => {
    try {
      await saveMutation.mutateAsync(t);
      setToast({ msg: "Template saved.", severity: "success" });
    } catch (e) {
      setToast({ msg: (e as Error).message, severity: "error" });
    }
  };

  const handleClone = (t: SmeTemplate) => {
    const clone: SmeTemplate = {
      ...t,
      id: `${t.id}-copy-${Date.now()}`,
      name: `${t.name} (copy)`,
      is_default: false,
    };
    setSelectedId(clone.id);
    saveMutation.mutate(clone);
  };

  const handleNew = () => {
    const blank: SmeTemplate = {
      id: `custom-${Date.now()}`,
      name: "New Template",
      soul: "",
      steps: [],
      sources: [],
      rules: [],
      is_default: false,
      visualisation_kind: "wave",
      theme_id: "dark-teal",
    };
    setSelectedId(blank.id);
    saveMutation.mutate(blank);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this template? This cannot be undone.")) return;
    try {
      await deleteMutation.mutateAsync(id);
      setSelectedId(null);
      setToast({ msg: "Template deleted.", severity: "success" });
    } catch (e) {
      setToast({ msg: (e as Error).message, severity: "error" });
    }
  };

  return (
    <Box sx={{ height: "100dvh", display: "flex", flexDirection: "column", bgcolor: "background.default" }}>
      <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
        <Toolbar>
          <Tooltip title="Back to voice agent">
            <IconButton edge="start" onClick={() => navigate("/")} aria-label="Back to voice agent" sx={{ mr: 1 }}>
              <ArrowBackIcon />
            </IconButton>
          </Tooltip>
          <Typography variant="h6" sx={{ flex: 1 }}>
            Configure
          </Typography>
        </Toolbar>
        <Tabs value={tab} onChange={(_, v: number) => setTab(v)} sx={{ px: 2 }}>
          <Tab label="Voice SMEs" id="tab-sme" aria-controls="panel-sme" />
          <Tab label="Code Agent" id="tab-agent" aria-controls="panel-agent" />
        </Tabs>
      </AppBar>

      {/* Code Agent tab */}
      <Box
        role="tabpanel"
        id="panel-agent"
        aria-labelledby="tab-agent"
        hidden={tab !== 1}
        sx={{ flex: 1, overflowY: "auto", p: 3 }}
      >
        {tab === 1 && <AgentConfigEditor />}
      </Box>

      {/* Voice SMEs tab */}
      <Box
        role="tabpanel"
        id="panel-sme"
        aria-labelledby="tab-sme"
        hidden={tab !== 0}
        sx={{ flex: 1, overflow: "hidden", minHeight: 0, display: tab === 0 ? "flex" : "none" }}
      >
      {isLoading ? (
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container sx={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
          {/* Template list */}
          <Grid
            size={{ xs: 12, md: 4 }}
            sx={{ height: "100%", borderRight: "1px solid", borderColor: "divider", overflowY: "auto", p: 2 }}
          >
            <Stack spacing={1.5}>
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Templates ({templates.length})
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={handleNew}
                  aria-label="Add new template"
                >
                  New
                </Button>
              </Stack>
              {templates.map((t) => (
                <Box key={t.id}>
                  <SmeTemplateCard
                    template={t}
                    selected={t.id === (selected?.id ?? "")}
                    isStartupDefault={t.id === defaultSmeId}
                    onSelect={setSelectedId}
                  />
                  <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end", mt: 0.5 }}>
                    <Tooltip title={t.id === defaultSmeId ? "Default on startup" : "Set as startup default"}>
                      <IconButton
                        size="small"
                        onClick={() => setDefaultSme(t.id)}
                        aria-label={`Set ${t.name} as startup default`}
                        sx={{ color: t.id === defaultSmeId ? "warning.main" : "text.disabled" }}
                      >
                        {t.id === defaultSmeId ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Clone template">
                      <IconButton size="small" onClick={() => handleClone(t)} aria-label={`Clone ${t.name}`}>
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {!t.is_default && (
                      <Tooltip title="Delete template">
                        <IconButton size="small" color="error" onClick={() => handleDelete(t.id)} aria-label={`Delete ${t.name}`}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {t.is_default && (
                      <Tooltip title="Locked — toggle 'Lock' in the editor to enable deletion">
                        <span>
                          <IconButton size="small" disabled aria-label={`${t.name} is locked`}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                  </Stack>
                </Box>
              ))}
              {templates.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  No templates found.
                </Typography>
              )}
            </Stack>
          </Grid>

          {/* Editor */}
          <Grid size={{ xs: 12, md: 8 }} sx={{ height: "100%", overflowY: "auto", p: 3 }}>
            {selected ? (
              <Paper variant="outlined" sx={{ p: 3 }}>
                <SmeEditor
                  template={selected}
                  onSave={handleSave}
                  isSaving={saveMutation.isPending}
                  saveError={saveMutation.isError ? (saveMutation.error as Error).message : null}
                />
              </Paper>
            ) : (
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                <Typography color="text.secondary">Select a template to edit</Typography>
              </Box>
            )}
          </Grid>
        </Grid>
      )}
      </Box>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)}>
            {toast.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
