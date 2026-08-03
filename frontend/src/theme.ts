import { createTheme, type PaletteMode, type Theme } from '@mui/material';

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif';

// Apple's own light/dark palettes: a near-black/near-white text pair, a
// slightly brighter accent blue in dark mode (better contrast on black),
// and hairline dividers rather than shadows for structure.
const palettes = {
  light: {
    background: { default: '#fbfbfd', paper: '#ffffff' },
    text: { primary: '#1d1d1f', secondary: '#6e6e73' },
    primary: { main: '#0071e3', dark: '#0058b0' },
    divider: '#d2d2d7',
  },
  dark: {
    background: { default: '#000000', paper: '#1d1d1f' },
    text: { primary: '#f5f5f7', secondary: '#86868b' },
    primary: { main: '#2997ff', dark: '#0071e3' },
    divider: '#38383a',
  },
} as const;

export function createAppTheme(mode: PaletteMode): Theme {
  const tokens = palettes[mode];

  return createTheme({
    palette: {
      mode,
      ...tokens,
      success: { main: '#30d158' },
      warning: { main: '#ff9f0a' },
      error: { main: '#ff3b30' },
    },
    shape: {
      borderRadius: 12,
    },
    typography: {
      fontFamily: FONT_STACK,
      h1: { fontWeight: 600, letterSpacing: '-0.03em' },
      h2: { fontWeight: 600, letterSpacing: '-0.02em' },
      h3: { fontWeight: 600, letterSpacing: '-0.02em' },
      h6: { fontWeight: 600, letterSpacing: '-0.01em' },
      body1: { letterSpacing: '-0.006em' },
      body2: { letterSpacing: '-0.006em' },
      button: { textTransform: 'none', fontWeight: 500, letterSpacing: '-0.006em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: {
            // Lets native form controls, scrollbars, etc. follow the
            // in-app toggle instead of only the OS preference.
            colorScheme: mode,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 980, // Apple's pill-button radius
            boxShadow: 'none',
            padding: '9px 20px',
            fontSize: '0.9rem',
          },
          contained: {
            '&:hover': { boxShadow: 'none' },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
        },
      },
    },
  });
}

/** Muted neutral surface for skeletons/code blocks — not a semantic palette
 *  color, so it lives here rather than as a theme token. */
export function mutedSurface(mode: PaletteMode): string {
  return mode === 'dark' ? '#1c1c1e' : '#f5f5f7';
}

/** The subtle border a card/control settles into on hover. */
export function hoverBorder(mode: PaletteMode): string {
  return mode === 'dark' ? '#4a4a4d' : '#bcbcc0';
}

/**
 * The filled primary action — Buy, List. Inverts text/background so it reads as
 * the one thing to click on a card.
 *
 * `isBusy` keeps a disabled button looking active-but-waiting rather than
 * greyed out: mid-transaction the button is disabled, but the user should see
 * work in progress, not a dead control.
 */
export function filledButtonSx(isDone: boolean, isBusy: boolean) {
  return {
    bgcolor: isDone ? 'success.main' : 'text.primary',
    color: isDone ? 'common.white' : 'background.default',
    py: 1.1,
    fontSize: '0.92rem',
    '&:hover': {
      bgcolor: isDone ? 'success.main' : 'text.primary',
      opacity: 0.85,
    },
    '&.Mui-disabled': isBusy
      ? { bgcolor: 'text.primary', color: 'background.default', opacity: 0.5 }
      : { bgcolor: 'action.disabledBackground', color: 'action.disabled' },
  } as const;
}

/** The quieter secondary action — Cancel listing, dismiss. */
export const outlinedButtonSx = {
  py: 1.1,
  fontSize: '0.92rem',
  color: 'text.primary',
  borderColor: 'divider',
} as const;
