// ============================================================
// FORGE OS — GEOMETRY (BUILD-D001)
// Reusable clip-path primitives. Institutional standard, not
// one-offs: every card, panel, button and metric uses one of
// these. No standard border-radius cards.
// ============================================================

export const FORGE_CLIPS = {
  panelBR:  'polygon(0 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%)',
  panelTR:  'polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 0 100%)',
  panelTL:  'polygon(20px 0, 100% 0, 100% 100%, 0 100%, 0 20px)',
  hex:      'polygon(20px 0%, calc(100% - 20px) 0%, 100% 50%, calc(100% - 20px) 100%, 20px 100%, 0% 50%)',
  button:   'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)',
  buttonSm: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)',
  metric:   'polygon(12px 0%, calc(100% - 12px) 0%, 100% 50%, calc(100% - 12px) 100%, 12px 100%, 0% 50%)',
  diamond:  'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
  slash:    'polygon(0 0, 100% 0, calc(100% - 28px) 100%, 0 100%)',
};

export const forgePanel = (variant = 'panelBR', extra = {}) => ({
  clipPath: FORGE_CLIPS[variant],
  ...extra,
});

export default { FORGE_CLIPS, forgePanel };
