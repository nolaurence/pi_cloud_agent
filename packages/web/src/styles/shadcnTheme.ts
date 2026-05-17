import { theme, type ConfigProviderProps } from "antd";

type ShadcnTone = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  border: string;
  input: string;
  ring: string;
};

const light: ShadcnTone = {
  background: "#ffffff",
  foreground: "#18181b",
  card: "#ffffff",
  cardForeground: "#18181b",
  popover: "#ffffff",
  popoverForeground: "#18181b",
  primary: "#18181b",
  primaryForeground: "#fafafa",
  secondary: "#f4f4f5",
  secondaryForeground: "#18181b",
  muted: "#f4f4f5",
  mutedForeground: "#71717a",
  accent: "#f4f4f5",
  accentForeground: "#18181b",
  border: "#e4e4e7",
  input: "#e4e4e7",
  ring: "#18181b"
};

const dark: ShadcnTone = {
  background: "#09090b",
  foreground: "#fafafa",
  card: "#18181b",
  cardForeground: "#fafafa",
  popover: "#18181b",
  popoverForeground: "#fafafa",
  primary: "#fafafa",
  primaryForeground: "#18181b",
  secondary: "#27272a",
  secondaryForeground: "#fafafa",
  muted: "#27272a",
  mutedForeground: "#a1a1aa",
  accent: "#27272a",
  accentForeground: "#fafafa",
  border: "#27272a",
  input: "#3f3f46",
  ring: "#d4d4d8"
};

export function getShadcnThemeConfig(isDark: boolean): ConfigProviderProps {
  const tone = isDark ? dark : light;

  return {
    theme: {
      algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      token: {
        colorPrimary: tone.primary,
        colorSuccess: "#22c55e",
        colorWarning: "#f97316",
        colorError: "#ef4444",
        colorInfo: tone.primary,
        colorTextBase: tone.foreground,
        colorBgBase: tone.background,
        colorPrimaryBg: tone.secondary,
        colorPrimaryBgHover: isDark ? "#3f3f46" : "#e4e4e7",
        colorPrimaryBorder: tone.border,
        colorPrimaryBorderHover: isDark ? "#71717a" : "#a1a1aa",
        colorPrimaryHover: isDark ? "#e4e4e7" : "#27272a",
        colorPrimaryActive: isDark ? "#d4d4d8" : "#09090b",
        colorPrimaryText: tone.primary,
        colorPrimaryTextHover: isDark ? "#e4e4e7" : "#27272a",
        colorPrimaryTextActive: isDark ? "#d4d4d8" : "#09090b",
        colorSuccessBg: isDark ? "rgba(34, 197, 94, 0.12)" : "#f0fdf4",
        colorSuccessBgHover: isDark ? "rgba(34, 197, 94, 0.18)" : "#dcfce7",
        colorSuccessBorder: isDark ? "rgba(34, 197, 94, 0.32)" : "#bbf7d0",
        colorSuccessBorderHover: isDark ? "rgba(34, 197, 94, 0.48)" : "#86efac",
        colorSuccessHover: "#16a34a",
        colorSuccessActive: "#15803d",
        colorSuccessText: "#16a34a",
        colorSuccessTextHover: "#16a34a",
        colorSuccessTextActive: "#15803d",
        colorWarningBg: isDark ? "rgba(249, 115, 22, 0.12)" : "#fff7ed",
        colorWarningBgHover: isDark ? "rgba(249, 115, 22, 0.18)" : "#fed7aa",
        colorWarningBorder: isDark ? "rgba(249, 115, 22, 0.32)" : "#fdba74",
        colorWarningBorderHover: isDark ? "rgba(249, 115, 22, 0.48)" : "#fb923c",
        colorWarningHover: "#ea580c",
        colorWarningActive: "#c2410c",
        colorWarningText: "#ea580c",
        colorWarningTextHover: "#ea580c",
        colorWarningTextActive: "#c2410c",
        colorErrorBg: isDark ? "rgba(239, 68, 68, 0.12)" : "#fef2f2",
        colorErrorBgHover: isDark ? "rgba(239, 68, 68, 0.18)" : "#fecaca",
        colorErrorBorder: isDark ? "rgba(239, 68, 68, 0.32)" : "#fca5a5",
        colorErrorBorderHover: isDark ? "rgba(239, 68, 68, 0.48)" : "#f87171",
        colorErrorHover: "#dc2626",
        colorErrorActive: "#b91c1c",
        colorErrorText: "#dc2626",
        colorErrorTextHover: "#dc2626",
        colorErrorTextActive: "#b91c1c",
        colorInfoBg: tone.secondary,
        colorInfoBgHover: tone.accent,
        colorInfoBorder: tone.border,
        colorInfoBorderHover: isDark ? "#71717a" : "#a1a1aa",
        colorInfoHover: isDark ? "#e4e4e7" : "#27272a",
        colorInfoActive: isDark ? "#d4d4d8" : "#09090b",
        colorInfoText: tone.primary,
        colorInfoTextHover: isDark ? "#e4e4e7" : "#27272a",
        colorInfoTextActive: isDark ? "#d4d4d8" : "#09090b",
        colorText: tone.foreground,
        colorTextSecondary: tone.mutedForeground,
        colorTextTertiary: tone.mutedForeground,
        colorTextQuaternary: isDark ? "#71717a" : "#a1a1aa",
        colorTextDisabled: isDark ? "#71717a" : "#a1a1aa",
        colorBgContainer: tone.card,
        colorBgElevated: tone.popover,
        colorBgLayout: tone.background,
        colorBgSpotlight: isDark ? "rgba(250, 250, 250, 0.85)" : "rgba(24, 24, 27, 0.85)",
        colorBgMask: isDark ? "rgba(0, 0, 0, 0.65)" : "rgba(24, 24, 27, 0.45)",
        colorBorder: tone.border,
        colorBorderSecondary: isDark ? "#18181b" : "#f4f4f5",
        borderRadius: 8,
        borderRadiusXS: 2,
        borderRadiusSM: 6,
        borderRadiusLG: 10,
        padding: 16,
        paddingSM: 12,
        paddingLG: 24,
        margin: 16,
        marginSM: 12,
        marginLG: 24,
        fontSize: 14,
        fontSizeSM: 12,
        fontSizeLG: 15,
        boxShadow: isDark ? "0 1px 2px rgba(0, 0, 0, 0.32)" : "0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
        boxShadowSecondary: isDark ? "0 8px 24px rgba(0, 0, 0, 0.32)" : "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)"
      },
      components: {
        Button: {
          primaryShadow: "none",
          defaultShadow: "none",
          dangerShadow: "none",
          defaultBg: isDark ? "#09090b" : tone.card,
          defaultColor: tone.foreground,
          defaultBorderColor: isDark ? "#3f3f46" : tone.border,
          defaultHoverBg: isDark ? "#18181b" : tone.accent,
          defaultHoverColor: tone.accentForeground,
          defaultHoverBorderColor: isDark ? "#3f3f46" : "#d4d4d8",
          defaultActiveBg: isDark ? "#3f3f46" : "#e4e4e7",
          defaultActiveBorderColor: isDark ? "#52525b" : "#d4d4d8",
          borderRadius: 8,
          controlHeight: 32,
          controlHeightSM: 28
        },
        Input: {
          activeShadow: "none",
          hoverBorderColor: isDark ? "#71717a" : "#a1a1aa",
          activeBorderColor: tone.ring,
          borderRadius: 6
        },
        Select: {
          optionSelectedBg: tone.accent,
          optionActiveBg: tone.muted,
          optionSelectedFontWeight: 500,
          borderRadius: 6
        },
        Alert: {
          borderRadiusLG: 8
        },
        Modal: {
          borderRadiusLG: 10
        },
        Progress: {
          defaultColor: tone.primary,
          remainingColor: tone.muted
        },
        Steps: {
          iconSize: 32
        },
        Switch: {
          trackHeight: 24,
          trackMinWidth: 44,
          innerMinMargin: 4,
          innerMaxMargin: 24
        },
        Checkbox: {
          borderRadiusSM: 4
        },
        Slider: {
          trackBg: tone.primary,
          trackHoverBg: isDark ? "#e4e4e7" : "#27272a",
          handleSize: 18,
          handleSizeHover: 20,
          railSize: 6
        },
        ColorPicker: {
          borderRadius: 6
        },
        Layout: {
          bodyBg: tone.background,
          headerBg: tone.background,
          siderBg: tone.background
        }
      }
    },
    button: {
      autoInsertSpace: false
    },
    form: {
      requiredMark: false
    },
    input: {
      variant: "outlined"
    },
    select: {
      variant: "outlined"
    },
    wave: {
      disabled: true
    }
  };
}
