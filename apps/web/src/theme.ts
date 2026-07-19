// App-level fallback theme — dark teal, used by ConfigPage and any unthemed surface.
// Per-SME / per-agent theming is applied by SentinelThemeProvider inside each page.
import { THEMES, createSentinelTheme } from "./themes/index";
export const theme = createSentinelTheme(THEMES["dark-teal"]);
