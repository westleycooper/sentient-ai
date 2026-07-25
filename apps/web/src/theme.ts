// App-level fallback theme — dark teal, used by ConfigPage and any unthemed surface.
// Per-SME / per-agent theming is applied by SentientThemeProvider inside each page.
import { THEMES, createSentientTheme } from "./themes/index";
export const theme = createSentientTheme(THEMES["dark-teal"]);
