import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Stack,
  Typography,
} from "@mui/material";
import type { SmeTemplate } from "../../api/hooks";

interface SmeTemplateCardProps {
  template: SmeTemplate;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function SmeTemplateCard({ template, selected, onSelect }: SmeTemplateCardProps) {
  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: selected ? "primary.main" : "divider",
        borderWidth: selected ? 2 : 1,
        transition: "border-color 0.15s",
      }}
    >
      <CardActionArea onClick={() => onSelect(template.id)}>
        <CardContent>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {template.name}
            </Typography>
            {template.is_default && (
              <Chip label="Default" size="small" color="secondary" variant="outlined" />
            )}
          </Stack>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 0.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
          >
            {template.soul}
          </Typography>
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {template.steps.length} steps · {template.sources.length} sources · {template.rules.length} rules
            </Typography>
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
