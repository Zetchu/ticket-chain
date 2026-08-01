import { createContext, useContext } from 'react';
import type { PaletteMode } from '@mui/material';

export interface ColorModeContextValue {
  mode: PaletteMode;
  toggleMode: () => void;
}

export const ColorModeContext = createContext<ColorModeContextValue>({
  mode: 'light',
  toggleMode: () => {},
});

export const useColorMode = () => useContext(ColorModeContext);
