/**
 * PermissionCard — approval UI for a single tool-use request.
 * Rendered above the mic button on the AgentPage, one card per pending request.
 * Keyboard-accessible; say "yes" / "no" to approve / deny via voice.
 */
import {
  Box,
  Button,
  Chip,
  Collapse,
  Stack,
  Typography,
} from "@mui/material";
import TerminalIcon from "@mui/icons-material/Terminal";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import EditIcon from "@mui/icons-material/Edit";
import CreateIcon from "@mui/icons-material/Create";
import ListIcon from "@mui/icons-material/List";
import type { ToolPermission } from "./useAgentSession";

const TOOL_META: Record<string, { label: string; Icon: React.ElementType; color: string }> = {
  bash:           { label: "Run command",    Icon: TerminalIcon,   color: "error" },
  read_file:      { label: "Read file",      Icon: FolderOpenIcon, color: "info" },
  write_file:     { label: "Write file",     Icon: CreateIcon,     color: "warning" },
  edit_file:      { label: "Edit file",      Icon: EditIcon,       color: "warning" },
  list_directory: { label: "List directory", Icon: ListIcon,       color: "info" },
};

interface PermissionCardProps {
  permission: ToolPermission;
  onApprove: (requestId: string, always: boolean) => void;
  onDeny: (requestId: string) => void;
}

export function PermissionCard({ permission, onApprove, onDeny }: PermissionCardProps) {
  const meta = TOOL_META[permission.tool] ?? {
    label: permission.tool,
    Icon: TerminalIcon,
    color: "default",
  };
  const { Icon } = meta;

  return (
    <Collapse in>
      <Box
        role="dialog"
        aria-label={`Approve ${meta.label}: ${permission.display.split("\n")[0]}`}
        sx={{
          width: "100%",
          maxWidth: 552,
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          p: 1.5,
          mb: 1,
        }}
      >
        {/* Header */}
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
          <Icon sx={{ fontSize: 16, color: `${meta.color}.main` }} aria-hidden="true" />
          <Typography variant="caption" sx={{ fontWeight: 700, color: `${meta.color}.main`, flex: 1 }}>
            {meta.label}
          </Typography>
          <Chip
            label="Needs approval"
            size="small"
            color="warning"
            variant="outlined"
            sx={{ height: 18, fontSize: 10 }}
          />
        </Stack>

        {/* Command / path preview */}
        <Box
          component="pre"
          sx={{
            fontFamily: "monospace",
            fontSize: "0.72rem",
            color: "text.secondary",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            bgcolor: "action.hover",
            borderRadius: 1,
            p: 1,
            mb: 1.5,
            maxHeight: 100,
            overflowY: "auto",
          }}
        >
          {permission.display}
        </Box>

        {/* Action buttons */}
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="contained"
            color="success"
            onClick={() => onApprove(permission.request_id, false)}
            aria-label="Allow this once"
            sx={{ minWidth: 64, textTransform: "none", fontSize: "0.75rem" }}
          >
            Allow
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="success"
            onClick={() => onApprove(permission.request_id, true)}
            aria-label={`Always allow ${meta.label} this session`}
            sx={{ minWidth: 96, textTransform: "none", fontSize: "0.75rem" }}
          >
            Allow Always
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={() => onDeny(permission.request_id)}
            aria-label="Deny"
            sx={{ minWidth: 56, textTransform: "none", fontSize: "0.75rem" }}
          >
            Deny
          </Button>
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ alignSelf: "center", ml: "auto !important" }}
          >
            say yes · always · no
          </Typography>
        </Stack>
      </Box>
    </Collapse>
  );
}
