import { createTheme, type Theme } from '@mui/material';

/**
 * Luminous Protocol — the TicketChain design system.
 *
 * Dark-only by design: the whole system is built on luminous accents against a
 * deep obsidian void, and a light variant would have nothing to glow against.
 */

export const FONT_DISPLAY = '"Sora", "Inter", system-ui, sans-serif';
export const FONT_BODY = '"Inter", system-ui, -apple-system, sans-serif';
export const FONT_MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

/** Raw palette tokens, kept together so the mapping to MUI stays readable. */
export const tokens = {
  /** The void everything floats on. */
  background: '#0b0b0f',
  surface: '#131317',
  surfaceContainer: '#1f1f23',
  surfaceContainerHigh: '#2a292e',

  /** Electric violet — brand, glow, focus. */
  violet: '#9945ff',
  violetBright: '#d8b9ff',
  violetDeep: '#450086',

  /** Electric orange — reserved for the primary call to action. */
  orange: '#fe6b00',
  orangeSoft: '#ffb693',

  /** Cyber cyan — status and success. */
  cyan: '#00dbe9',
  cyanDeep: '#00838c',

  error: '#ffb4ab',

  onSurface: '#e4e1e7',
  onSurfaceVariant: '#cec2d8',
  outline: '#978da1',
} as const;

/** Level 2 elevation: the standard glass panel. */
export const glassPanelSx = {
  background: 'rgba(25, 25, 35, 0.6)',
  backdropFilter: 'blur(40px)',
  WebkitBackdropFilter: 'blur(40px)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '12px',
} as const;

/** Level 3: a glass panel that is active or hovered — lit from within. */
export const glassGlowSx = {
  borderColor: 'rgba(153, 69, 255, 0.4)',
  boxShadow: '0 0 30px rgba(153, 69, 255, 0.15)',
} as const;

/** The luminous headline treatment from the display type spec. */
export const displayGlowSx = {
  fontFamily: FONT_DISPLAY,
  fontWeight: 700,
  letterSpacing: '-0.02em',
  lineHeight: 1.1,
  textShadow: '0 0 15px rgba(153, 69, 255, 0.5)',
} as const;

/** Mono label: wallet addresses, token IDs, transaction hashes. */
export const monoLabelSx = {
  fontFamily: FONT_MONO,
  fontSize: '0.75rem',
  fontWeight: 500,
  letterSpacing: '0.05em',
} as const;

/**
 * Primary action — electric orange, black text. Reserved for the one thing to
 * click: buy, mint, list. `isBusy` keeps a disabled button looking like work in
 * progress rather than a dead control.
 */
export function ctaButtonSx(isDone = false, isBusy = false) {
  return {
    bgcolor: isDone ? tokens.cyanDeep : tokens.orange,
    color: isDone ? '#ffffff' : '#0b0b0f',
    fontWeight: 600,
    borderRadius: '4px',
    py: 1.15,
    '&:hover': {
      bgcolor: isDone ? tokens.cyanDeep : tokens.orange,
      boxShadow: `0 0 10px ${isDone ? 'rgba(0, 219, 233, 0.5)' : 'rgba(254, 107, 0, 0.55)'}`,
    },
    '&.Mui-disabled': isBusy
      ? { bgcolor: tokens.orange, color: '#0b0b0f', opacity: 0.45 }
      : { bgcolor: 'rgba(255, 255, 255, 0.06)', color: 'rgba(228, 225, 231, 0.35)' },
  } as const;
}

/** Secondary action — transparent with a violet gradient hairline. */
export const outlineButtonSx = {
  position: 'relative',
  bgcolor: 'transparent',
  color: tokens.onSurface,
  fontWeight: 500,
  borderRadius: '4px',
  py: 1.15,
  border: '1px solid rgba(153, 69, 255, 0.4)',
  '&:hover': {
    bgcolor: 'rgba(153, 69, 255, 0.08)',
    borderColor: tokens.violet,
  },
  '&.Mui-disabled': { borderColor: 'rgba(255, 255, 255, 0.08)', color: 'rgba(228, 225, 231, 0.3)' },
} as const;

/** Ghost action — violet mono text, no chrome. */
export const ghostButtonSx = {
  ...monoLabelSx,
  color: tokens.violetBright,
  bgcolor: 'transparent',
  textTransform: 'uppercase',
  '&:hover': { bgcolor: 'transparent', color: '#ffffff' },
} as const;

export function createAppTheme(): Theme {
  return createTheme({
    palette: {
      mode: 'dark',
      background: { default: tokens.background, paper: tokens.surfaceContainer },
      primary: { main: tokens.violet, light: tokens.violetBright, dark: tokens.violetDeep },
      secondary: { main: tokens.orange, light: tokens.orangeSoft },
      success: { main: tokens.cyan, dark: tokens.cyanDeep },
      info: { main: tokens.cyan },
      warning: { main: tokens.orangeSoft },
      error: { main: tokens.error },
      text: {
        primary: tokens.onSurface,
        secondary: tokens.onSurfaceVariant,
        disabled: tokens.outline,
      },
      divider: 'rgba(255, 255, 255, 0.1)',
    },
    shape: {
      // Sharp and technical: small elements are 4px, containers opt into 12px.
      borderRadius: 4,
    },
    typography: {
      fontFamily: FONT_BODY,
      h1: { fontFamily: FONT_DISPLAY, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 },
      h2: { fontFamily: FONT_DISPLAY, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 },
      h3: { fontFamily: FONT_DISPLAY, fontWeight: 600, lineHeight: 1.3 },
      h4: { fontFamily: FONT_DISPLAY, fontWeight: 600, lineHeight: 1.3 },
      h5: { fontFamily: FONT_DISPLAY, fontWeight: 600, lineHeight: 1.3 },
      h6: { fontFamily: FONT_DISPLAY, fontWeight: 600, lineHeight: 1.3 },
      body1: { fontSize: '1rem', lineHeight: 1.6 },
      body2: { fontSize: '0.9rem', lineHeight: 1.6 },
      overline: { ...monoLabelSx, textTransform: 'uppercase' },
      button: { textTransform: 'none', fontWeight: 500, letterSpacing: '0.01em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: { colorScheme: 'dark' },
          body: {
            // Level 0: the void, with a faint 40px grid for structure.
            backgroundColor: tokens.background,
            backgroundImage: `
              linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
            backgroundAttachment: 'fixed',
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: '4px', boxShadow: 'none', padding: '9px 20px', fontSize: '0.9rem' },
        },
      },
      MuiPaper: {
        styleOverrides: { root: { backgroundImage: 'none' } },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '4px',
            '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
            '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.2)' },
            '&.Mui-focused fieldset': { borderColor: tokens.violet, borderWidth: '1px' },
            '&.Mui-focused': { boxShadow: 'inset 0 0 12px rgba(153, 69, 255, 0.15)' },
          },
          input: { '&::placeholder': { color: tokens.outline, opacity: 1 } },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: { color: tokens.outline, '&.Mui-focused': { color: tokens.violetBright } },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            ...monoLabelSx,
            backgroundColor: tokens.surfaceContainerHigh,
            border: '1px solid rgba(255, 255, 255, 0.1)',
          },
        },
      },
    },
  });
}
