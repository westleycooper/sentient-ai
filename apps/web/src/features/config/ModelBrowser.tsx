import { useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import RefreshIcon from "@mui/icons-material/Refresh";

import {
  useDeleteLocalModel,
  useFrontierModels,
  useLocalModelBrowser,
  usePullLocalModel,
  type FrontierModelOption,
} from "../../api/hooks";

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
};

interface ModelBrowserProps {
  open: boolean;
  onClose: () => void;
  value: string | null;
  onChange: (modelId: string | null) => void;
  /** Show a "Use platform default" option that clears the selection to null. */
  allowNone?: boolean;
}

export function ModelBrowser({ open, onClose, value, onChange, allowNone }: ModelBrowserProps) {
  const [tab, setTab] = useState(0);
  const { data: frontierModels, isLoading: frontierLoading } = useFrontierModels();
  const { data: localState, isLoading: localLoading, refetch: refetchLocal } = useLocalModelBrowser();
  const deleteMutation = useDeleteLocalModel();
  const { pull, progress, isPulling, error: pullError } = usePullLocalModel();
  const [customTag, setCustomTag] = useState("");

  const select = (modelId: string | null) => {
    onChange(modelId);
    onClose();
  };

  const pullingTag =
    isPulling && progress?.type !== "complete" ? customTag || undefined : undefined;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Choose a model</DialogTitle>
      <DialogContent>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} aria-label="Model source">
          <Tab label="Frontier" id="tab-frontier" aria-controls="tabpanel-frontier" />
          <Tab label="Local (Ollama)" id="tab-local" aria-controls="tabpanel-local" />
        </Tabs>
        <Divider sx={{ mb: 2 }} />

        {tab === 0 && (
          <Box role="tabpanel" id="tabpanel-frontier" aria-labelledby="tab-frontier">
            {allowNone && (
              <Button size="small" sx={{ mb: 1.5 }} onClick={() => select(null)}>
                Use platform default
              </Button>
            )}
            {frontierLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                <CircularProgress size={24} />
              </Box>
            ) : (
              <Autocomplete<FrontierModelOption>
                options={frontierModels ?? []}
                groupBy={(m) => PROVIDER_LABELS[m.provider] ?? m.provider}
                getOptionLabel={(m) => m.label}
                value={(frontierModels ?? []).find((m) => m.id === value) ?? null}
                onChange={(_, m) => select(m ? m.id : null)}
                renderOption={(props, m) => (
                  <Box component="li" {...props} key={m.id}>
                    <Stack>
                      <Typography variant="body2">{m.label}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {m.description}
                      </Typography>
                    </Stack>
                  </Box>
                )}
                renderInput={(params) => (
                  <TextField {...params} label="Search frontier models" size="small" autoFocus />
                )}
              />
            )}
          </Box>
        )}

        {tab === 1 && (
          <Box role="tabpanel" id="tabpanel-local" aria-labelledby="tab-local">
            {localLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                <CircularProgress size={24} />
              </Box>
            ) : !localState?.runtime_available ? (
              <Alert
                severity="info"
                action={
                  <IconButton size="small" onClick={() => refetchLocal()} aria-label="Retry">
                    <RefreshIcon fontSize="small" />
                  </IconButton>
                }
              >
                Ollama isn't running at {localState?.base_url ?? "http://localhost:11434"}. Install
                it from <code>ollama.com/download</code>, then run <code>ollama serve</code> and
                retry.
              </Alert>
            ) : (
              <Stack spacing={2}>
                {localState.installed.length > 0 && (
                  <Box>
                    <Typography variant="subtitle2" gutterBottom>
                      Installed
                    </Typography>
                    <List dense disablePadding>
                      {localState.installed.map((m) => (
                        <ListItem
                          key={m.id}
                          disablePadding
                          secondaryAction={
                            <Tooltip title="Delete">
                              <IconButton
                                size="small"
                                edge="end"
                                aria-label={`Delete ${m.name}`}
                                onClick={() => deleteMutation.mutate(m.name)}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          }
                        >
                          <ListItemIcon sx={{ minWidth: 32 }}>
                            <CheckCircleIcon fontSize="small" color="success" />
                          </ListItemIcon>
                          <ListItemText
                            onClick={() => select(`ollama:${m.name}`)}
                            sx={{ cursor: "pointer" }}
                            primary={m.name}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Box>
                )}

                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Recommended
                  </Typography>
                  <List dense disablePadding>
                    {localState.recommended.map((m) => (
                      <ListItem
                        key={m.tag}
                        disablePadding
                        secondaryAction={
                          <Tooltip title="Download">
                            <IconButton
                              size="small"
                              edge="end"
                              aria-label={`Download ${m.label}`}
                              onClick={() => {
                                setCustomTag(m.tag);
                                pull(m.tag);
                              }}
                              disabled={isPulling}
                            >
                              <DownloadIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        }
                      >
                        <ListItemText primary={m.label} secondary={m.description} />
                      </ListItem>
                    ))}
                  </List>
                </Box>

                <Stack direction="row" spacing={1}>
                  <TextField
                    size="small"
                    label="Pull any Ollama tag"
                    placeholder="e.g. gemma4:31b"
                    value={customTag}
                    onChange={(e) => setCustomTag(e.target.value)}
                    fullWidth
                  />
                  <Button
                    variant="outlined"
                    disabled={!customTag || isPulling}
                    onClick={() => pull(customTag)}
                  >
                    Pull
                  </Button>
                </Stack>

                {isPulling && (
                  <Box>
                    <LinearProgress
                      variant={
                        progress?.total != null && progress?.completed != null
                          ? "determinate"
                          : "indeterminate"
                      }
                      value={
                        progress?.total
                          ? Math.round(((progress.completed ?? 0) / progress.total) * 100)
                          : undefined
                      }
                    />
                    <Typography variant="caption" color="text.secondary">
                      {pullingTag ? `Pulling ${pullingTag}… ` : ""}
                      {progress?.status ?? "starting…"}
                    </Typography>
                  </Box>
                )}
                {progress?.type === "complete" && (
                  <Chip size="small" color="success" label={`Downloaded ${progress.model_tag}`} />
                )}
                {pullError && (
                  <Alert severity="error" sx={{ py: 0 }}>
                    {pullError}
                  </Alert>
                )}
              </Stack>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
