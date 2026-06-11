---
version: ios13
name: iOS-iPadOS-13-Design-UI-Kit
description: Apple Human Interface Guidelines (iOS 13) 기반 디자인 시스템. SF Pro 시스템 폰트, Grouped Background 레이아웃, System Blue 액센트, 10–13pt 라운드 코너, 라이트/다크 모드 자동 대응.

colors:
  system-blue: "#007AFF"
  system-green: "#34C759"
  system-red: "#FF3B30"
  system-orange: "#FF9500"
  system-gray-6: "#F2F2F7"
  label: "#000000"
  secondary-label: "rgba(60, 60, 67, 0.6)"
  system-grouped-background: "#F2F2F7"
  secondary-system-grouped-background: "#FFFFFF"
  separator: "rgba(60, 60, 67, 0.29)"

typography:
  large-title:
    fontFamily: "-apple-system, SF Pro Display"
    fontSize: 34px
    fontWeight: 700
    lineHeight: 1.176
    letterSpacing: 0.012em
  title-2:
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1.273
  headline:
    fontSize: 17px
    fontWeight: 600
    letterSpacing: -0.022em
  body:
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.294
    letterSpacing: -0.022em
  footnote:
    fontSize: 13px
    fontWeight: 400
  caption:
    fontSize: 12px
    fontWeight: 400

rounded:
  sm: 8px
  md: 10px
  lg: 13px
  xl: 20px
  bubble: 18px

spacing:
  grid: 8pt
  xxxs: 4px
  xxs: 8px
  xs: 16px
  sm: 20px
  md: 24px
  lg: 32px
  xl: 44px

components:
  grouped-card:
    background: secondary-system-grouped-background
    borderRadius: 13px
    shadow: subtle
  button-filled:
    background: system-blue
  button-gray:
    background: system-gray-5
  chat-bubble-user:
    background: system-green
  chat-bubble-assistant:
    background: system-gray-5
  modal-alert:
    borderRadius: 20px
    maxWidth: 400px

files:
  theme: ios-theme.css
  legacy: ferrari-theme.css
