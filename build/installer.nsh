; Allow OfficeLink through Windows Defender Firewall so colleagues can
; discover this computer and download shared files without extra prompts.
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="OfficeLink"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="OfficeLink" dir=in action=allow program="$INSTDIR\OfficeLink.exe" enable=yes profile=any'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="OfficeLink"'
!macroend
