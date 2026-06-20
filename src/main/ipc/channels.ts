// Single source of truth for IPC channel names, shared by main + preload.
export const CH = {
  briefingRun: 'briefing:run',
  briefingReady: 'briefing:ready',
  answerAsk: 'answer:ask',
  answerPartial: 'answer:partial',
  answerStatus: 'answer:status',
  answerFinal: 'answer:final',
  setFormat: 'answer:setFormat',
  windowSnap: 'window:snap',
  windowCollapse: 'window:collapse',
  windowHidden: 'window:hidden',
  windowContentSize: 'window:contentSize',
  windowCollapsedChanged: 'window:collapsedChanged',
  shortcut: 'window:shortcut',
  settingsGet: 'settings:get',
  settingsAppearance: 'settings:appearance',
  shortcutSet: 'shortcut:set',
  syncStatus: 'sync:status',
  // Audio + transcription
  audioStart: 'audio:start',
  audioStop: 'audio:stop',
  audioFrame: 'audio:frame',
  transcriptUpdate: 'transcript:update',
  // Modes
  modesList: 'modes:list',
  modeCreate: 'modes:create',
  modeUpdate: 'modes:update',
  modeDelete: 'modes:delete',
  modeSetActive: 'modes:setActive'
} as const
