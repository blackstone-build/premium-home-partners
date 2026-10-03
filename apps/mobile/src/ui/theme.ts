import { createContext, createElement, useContext, type ReactNode } from 'react';
import { DARK, LIGHT, type Palette } from '../theme/tokens';

const PaletteContext = createContext<Palette>(LIGHT);

export function PaletteProvider({ value, children }: { value: Palette; children: ReactNode }) {
  return createElement(PaletteContext.Provider, { value }, children);
}

export function usePalette(): Palette {
  return useContext(PaletteContext);
}

export { DARK, LIGHT };
