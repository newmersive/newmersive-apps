import { colors } from "../../theme/colors";
import type { AllwainAppMode } from "../../store/auth.store";

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
} as const;

export const radii = {
  control: 12,
  card: 16,
} as const;

export const interaction = {
  targetSize: 44,
  brandText: colors.brandDark,
  brandAction: colors.primary,
} as const;

export const layout = {
  navigationMaxWidth: 980,
  wideBreakpoint: 768,
} as const;

export const roleContext: Record<
  AllwainAppMode,
  { label: string; background: string; foreground: string; accent: string }
> = {
  buy: {
    label: "Comprador",
    background: colors.highlight,
    foreground: colors.text,
    accent: colors.primary,
  },
  sell: {
    label: "Vendedor",
    background: "#F0F2F0",
    foreground: colors.text,
    accent: colors.brandDark,
  },
  connector: {
    label: "Conector",
    background: colors.highlight,
    foreground: colors.text,
    accent: colors.primary,
  },
};
