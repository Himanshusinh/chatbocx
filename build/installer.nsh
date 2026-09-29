; Allow OfficeLink through Windows Defender Firewall so colleagues can
; discover this computer and download shared files without extra prompts.
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="OfficeLink"'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="OfficeLink Discovery"'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="OfficeLink Chat"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="OfficeLink" dir=in action=allow program="$INSTDIR\OfficeLink.exe" enable=yes profile=any'
  nsExec::Exec 'netsh advfirewall firewall add rule name="OfficeLink Discovery" dir=in action=allow protocol=UDP localport=45320 enable=yes profile=any'
  nsExec::Exec 'netsh advfirewall firewall add rule name="OfficeLink Chat" dir=in action=allow protocol=TCP localport=45321-45350 enable=yes profile=any'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="OfficeLink"'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="OfficeLink Discovery"'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="OfficeLink Chat"'
!macroend
