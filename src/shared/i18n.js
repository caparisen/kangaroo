/*
 * UI strings for the app and the tray menu. English is the default language;
 * Chinese is available through the in-app language switch.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.I18n = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STRINGS = {
    en: {
      enabled: 'Enabled',
      autoStart: 'Start with Windows',
      reset: 'Reset',
      preview: 'Preview',
      replay: 'Replay',
      speed: 'Speed',
      speedStart: 'Start',
      speedFull: 'Full',
      speedKick: 'Accel',
      speedLive: 'Speed {speed} px/s, accel {accel} px/s², zoom {scale}×',
      off: 'Off',
      speedPreset_linear: 'Linear',
      speedPreset_smooth: 'Smooth',
      speedPreset_fast: 'Responsive',
      speedPreset_late: 'Late',
      pointer: 'Pointer',
      pointerSize: 'Size',
      pointerGlow: 'Glow',
      opacity: 'Opacity',
      pointerHint: 'Drag the handles to adjust',
      pointerMeta: 'Size {size}× · Glow {glow}%',
      growAnimation: 'Grow animation',
      shrinkAnimation: 'Shrink animation',
      curve: 'Curve',
      spring: 'Spring',
      custom: 'Custom',
      duration: 'Duration',
      stiffness: 'Stiffness',
      damping: 'Damping',
      mass: 'Mass',
      preset_linear: 'Linear',
      preset_easeoutcubic: 'Ease out',
      preset_easeoutquint: 'Fast ease out',
      preset_easeoutexpo: 'Snap',
      preset_easeoutback: 'Overshoot',
      preset_easeinout: 'Ease in-out',
      preset_easeoutslow: 'Fast in, slow out',
      trayEnable: 'Enable pointer zoom',
      traySettings: 'Settings…',
      trayRestart: 'Restart',
      trayQuit: 'Quit',
      tooltip: 'Kangaroo'
    },
    zh: {
      enabled: '启用',
      autoStart: '随系统启动',
      reset: '恢复默认',
      preview: '预览',
      replay: '重播',
      speed: '速度',
      speedStart: '起始',
      speedFull: '满速',
      speedKick: '加速度',
      speedLive: '速度 {speed} px/s，加速度 {accel} px/s²，放大 {scale}×',
      off: '关闭',
      speedPreset_linear: '线性',
      speedPreset_smooth: '平滑',
      speedPreset_fast: '灵敏',
      speedPreset_late: '后段',
      pointer: '光标',
      pointerSize: '大小',
      pointerGlow: '光晕',
      opacity: '透明度',
      pointerHint: '拖动控制点调整',
      pointerMeta: '大小 {size}× · 光晕 {glow}%',
      growAnimation: '放大动画',
      shrinkAnimation: '收起动画',
      curve: '曲线',
      spring: '弹簧',
      custom: '自定义',
      duration: '时长',
      stiffness: '刚度',
      damping: '阻尼',
      mass: '质量',
      preset_linear: '线性',
      preset_easeoutcubic: '缓出',
      preset_easeoutquint: '快速缓出',
      preset_easeoutexpo: '急停',
      preset_easeoutback: '回弹',
      preset_easeinout: '平滑进出',
      preset_easeoutslow: '快起慢收',
      trayEnable: '启用光标放大',
      traySettings: '设置…',
      trayRestart: '重启应用',
      trayQuit: '退出',
      tooltip: 'Kangaroo'
    }
  };

  function format(template, vars) {
    return String(template).replace(/\{(\w+)\}/g, (match, key) =>
      vars && Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match
    );
  }

  function t(language, key, vars) {
    const table = STRINGS[language] || STRINGS.en;
    const value = table[key] !== undefined ? table[key] : STRINGS.en[key];
    return format(value === undefined ? key : value, vars);
  }

  return { STRINGS, t, format };
});
