/**
 * ConfigPage — single-page SME configuration.
 *
 * Left panel: template cards (select/clone).
 * Right panel: full editor for the selected template.
 * CLAUDE.md §6: all SME config on one page.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  AppBar,
  Box,
  Button,
  CircularProgress,
  Divider,
  Grid,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";

import { SmeTemplateCard } from "../features/config/SmeTemplateCard";
import { SmeEditor } from "../features/config/SmeEditor";
import {
  useSmeTemplates,
  useSaveSmeTemplate,
  useDeleteSmeTemplate,
  type SmeTemplate,
} from "../api/hooks";

export function ConfigPage() {
  const navigate = useNavigate();
  const { data: templates = [], isLoading } = useSmeTemplates();
  const saveMutation = useSaveSmeTemplate();
  const deleteMutation = useDeleteSmeTemplate();

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
            Configure Subject-Matter Experts
          </Typography>
        </Toolbar>
      </AppBar>

      {isLoading ? (
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container sx={{ flex: 1, overflow: "hidden" }}>
          {/* Template list */}
          <Grid
            item
            xs={12}
            md={4}
            sx={{ borderRight: "1px solid", borderColor: "divider", overflowY: "auto", p: 2 }}
          >
            <Stack spacing={1.5}>
              <Typography variant="subtitle2" color="text.secondary">
                Templates ({templates.length})
              </Typography>
              {templates.map((t) => (
                <Box key={t.id}>
                  <SmeTemplateCard
                    template={t}
                    selected={t.id === (selected?.id ?? "")}
                    onSelect={setSelectedId}
                  />
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end" sx={{ mt: 0.5 }}>
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
          <Grid item xs={12} md={8} sx={{ overflowY: "auto", p: 3 }}>
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
