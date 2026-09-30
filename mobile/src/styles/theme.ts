export const theme = {
  colors: {
    background: '#0B0E14',
    surface: '#151A23',
    surfaceElevated: '#1E2532',
    border: '#2A3344',
    
    // Accents
    primary: '#00E5FF',       // Neon Cyan (Ready / Connected)
    primaryGlow: 'rgba(0, 229, 255, 0.25)',
    success: '#00E676',       // Emerald Green (Unlocked)
    successGlow: 'rgba(0, 230, 118, 0.25)',
    warning: '#FFAB00',       // Amber (Cooldown / Caution)
    warningGlow: 'rgba(255, 171, 0, 0.25)',
    error: '#FF1744',         // Ruby Red (Denied / Error)
    errorGlow: 'rgba(255, 23, 68, 0.25)',

    // Text
    textPrimary: '#FFFFFF',
    textSecondary: '#8B98A5',
    textMuted: '#52606D',
    
    // Sliders / Controls
    sliderTrack: '#232C3D',
    sliderThumb: '#00E5FF',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  borderRadius: {
    sm: 8,
    md: 14,
    lg: 20,
    round: 999,
  },
  typography: {
    title: {
      fontSize: 22,
      fontWeight: '700' as const,
      letterSpacing: 0.5,
    },
    subtitle: {
      fontSize: 15,
      fontWeight: '600' as const,
    },
    body: {
      fontSize: 14,
      fontWeight: '400' as const,
    },
    caption: {
      fontSize: 12,
      fontWeight: '500' as const,
    },
    mono: {
      fontSize: 12,
      fontWeight: '600' as const,
      fontFamily: 'Courier',
    },
  },
};
