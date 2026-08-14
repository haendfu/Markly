; Markly NSIS 安装钩子
; 右键菜单「用 Markly 打开」（当前用户，无需管理员）

!macro REGISTER_MARKLY_EXT EXT
  WriteRegStr SHCTX "Software\Classes\.${EXT}\shell\Markly" "" "用 Markly 打开"
  WriteRegStr SHCTX "Software\Classes\.${EXT}\shell\Markly" "Icon" "$INSTDIR\Markly.exe"
  WriteRegStr SHCTX "Software\Classes\.${EXT}\shell\Markly\command" "" '"$INSTDIR\Markly.exe" "%1"'
!macroend

!macro UNREGISTER_MARKLY_EXT EXT
  DeleteRegKey SHCTX "Software\Classes\.${EXT}\shell\Markly"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro REGISTER_MARKLY_EXT "md"
  !insertmacro REGISTER_MARKLY_EXT "markdown"
  !insertmacro REGISTER_MARKLY_EXT "mdown"
  !insertmacro REGISTER_MARKLY_EXT "mkd"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro UNREGISTER_MARKLY_EXT "md"
  !insertmacro UNREGISTER_MARKLY_EXT "markdown"
  !insertmacro UNREGISTER_MARKLY_EXT "mdown"
  !insertmacro UNREGISTER_MARKLY_EXT "mkd"
!macroend
