/**
 * McpLiveStats — a row of stat tiles summarising the MCP server's exposed
 * surface (ADR-0004): SME template count, conversations touched, resource
 * and tool counts. Pulled live from GET /mcp-status via useMcpStatus().
 */
import { Box, Paper, Stack, Typography } from "@mui/material";
import type { McpStatus } from "../../api/hooks";

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        flex: 1,
        minWidth: 140,
        p: 2,
        textAlign: "center",
        borderColor: "divider",
      }}
    >
      <Typography variant="h4" sx={{ fontWeight: 700, color: "primary.main" }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
    </Paper>
  );
}

export function McpLiveStats({ status }: { status: McpStatus }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: "wrap" }}>
        <StatTile label="SME templates" value={status.sme_template_count} />
        <StatTile label="Conversations touched" value={status.conversations_touched_count} />
        <StatTile label="Resources exposed" value={status.resources.length} />
        <StatTile label="Tools exposed" value={status.tools.length} />
      </Stack>
    </Box>
  );
}
