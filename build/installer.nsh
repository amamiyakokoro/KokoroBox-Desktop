!ifndef BUILD_UNINSTALLER
!include FileFunc.nsh
!insertmacro DriveSpace

!define KOKOROBOX_MIN_TEMP_SPACE_MB 1024
!define KOKOROBOX_SERVICE_NAME "KokoroBoxService"
!define LEGACY_SERVICE_NAME "SparkleService"
!define KOKOROBOX_ELEVATED_TASK_NAME "KokoroBox Elevated"
!define LEGACY_ELEVATED_TASK_NAME "sparkle-run"

!macro customHeader
  Var kokoroboxServiceWasRunning
!macroend

!macro EnsureTempSpace
  ${DriveSpace} "$TEMP" "/D=F /S=M" $R0
  ${If} $R0 < ${KOKOROBOX_MIN_TEMP_SPACE_MB}
    MessageBox MB_ICONSTOP "Not enough space in the temp directory. Free at least ${KOKOROBOX_MIN_TEMP_SPACE_MB} MB on the temp drive or set TEMP/TMP to another drive, then run the installer again."
    Abort
  ${EndIf}
!macroend

!macro ServiceOutputContains NEEDLE RESULT
  StrCpy ${RESULT} "false"
  StrCpy $R5 0
  StrLen $R6 $R3
  StrLen $R8 "${NEEDLE}"
  ${Do}
    StrCpy $R9 $R3 $R8 $R5
    ${If} $R9 == "${NEEDLE}"
      StrCpy ${RESULT} "true"
      ${Break}
    ${EndIf}
    IntOp $R5 $R5 + 1
  ${LoopUntil} $R5 >= $R6
!macroend

!macro QueryServiceState NAME RESULT
  nsExec::ExecToStack '"$SYSDIR\sc.exe" query "${NAME}"'
  Pop $R2
  Pop $R3

  StrCpy ${RESULT} "not-installed"
  ${If} $R2 == 0
    !insertmacro ServiceOutputContains "RUNNING" $R4
    ${If} $R4 == "true"
      StrCpy ${RESULT} "running"
    ${Else}
      !insertmacro ServiceOutputContains "STOP_PENDING" $R4
      ${If} $R4 == "true"
        StrCpy ${RESULT} "stop-pending"
      ${Else}
        !insertmacro ServiceOutputContains "STOPPED" $R4
        ${If} $R4 == "true"
          StrCpy ${RESULT} "stopped"
        ${Else}
          StrCpy ${RESULT} "unknown"
        ${EndIf}
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

!macro WaitServiceStopped NAME
  StrCpy $R0 0
  ${Do}
    !insertmacro QueryServiceState "${NAME}" $R1
    ${If} $R1 == "stopped"
    ${OrIf} $R1 == "not-installed"
      ${Break}
    ${EndIf}
    Sleep 500
    IntOp $R0 $R0 + 1
  ${LoopUntil} $R0 >= 30

  !insertmacro QueryServiceState "${NAME}" $R1
  ${If} $R1 != "stopped"
  ${AndIf} $R1 != "not-installed"
    MessageBox MB_ICONSTOP "KokoroBox service is still running. Please stop the service and run the installer again."
    Abort
  ${EndIf}
!macroend

!macro DisableSysProxy
  StrCpy $R1 "$INSTDIR\resources\files\kokorobox-service.exe"
  ${IfNot} ${FileExists} "$R1"
    StrCpy $R1 "$INSTDIR\resources\files\sparkle-service.exe"
  ${EndIf}
  ${If} ${FileExists} "$R1"
    DetailPrint "Disabling system proxy: $R1"
    nsExec::ExecToLog '"$R1" sysproxy disable'
    Pop $R2
    ${If} $R2 != 0
      DetailPrint "Disable system proxy exited with code $R2"
    ${EndIf}
  ${EndIf}
!macroend

!macro StopServiceIfRunning NAME
  !insertmacro QueryServiceState "${NAME}" $R1

  ${If} $R1 != "stopped"
  ${AndIf} $R1 != "not-installed"
    StrCpy $kokoroboxServiceWasRunning "true"
    DetailPrint "Stopping KokoroBox service"
    nsExec::ExecToStack '"$SYSDIR\sc.exe" stop "${NAME}"'
    Pop $R2
    Pop $R3
    !insertmacro WaitServiceStopped "${NAME}"
    !insertmacro DisableSysProxy
  ${EndIf}
!macroend

!macro EnsureAppRoutingFirewall
  StrCpy $R0 "$INSTDIR\resources\files\process-router\kokorobox-process-router.exe"
  ${If} ${FileExists} "$R0"
    StrCpy $R1 "$INSTDIR\resources\files\kokorobox-service.exe"
    ${IfNot} ${FileExists} "$R1"
      MessageBox MB_ICONSTOP "KokoroBox application-routing firewall setup is unavailable because the privileged service helper is missing."
      Abort
    ${EndIf}
    DetailPrint "Creating KokoroBox application-routing firewall rules"
    nsExec::ExecToStack '"$R1" process-router firewall ensure'
    Pop $R2
    Pop $R3
    ${If} $R2 != 0
      MessageBox MB_ICONSTOP "KokoroBox could not create or verify the application-routing firewall rules. Installation cannot continue safely.$\r$\n$\r$\n$R3"
      Abort
    ${EndIf}
  ${EndIf}
!macroend

!macro RemoveAppRoutingFirewall
  StrCpy $R1 "$INSTDIR\resources\files\kokorobox-service.exe"
  ${If} ${FileExists} "$R1"
    DetailPrint "Removing KokoroBox application-routing firewall rules"
    nsExec::ExecToLog '"$R1" process-router firewall remove'
    Pop $R2
    ${If} $R2 != 0
      DetailPrint "Application-routing firewall cleanup exited with code $R2"
    ${EndIf}
  ${EndIf}
!macroend

!macro RemoveLegacyElevationArtifacts
  DetailPrint "Removing obsolete KokoroBox elevation tasks and launcher files"
    nsExec::ExecToLog '"$SYSDIR\schtasks.exe" /Delete /TN "${KOKOROBOX_ELEVATED_TASK_NAME}" /F'
    Pop $R2
    nsExec::ExecToLog '"$SYSDIR\schtasks.exe" /Delete /TN "${LEGACY_ELEVATED_TASK_NAME}" /F'
    Pop $R2
    Delete /REBOOTOK "$INSTDIR\resources\files\kokorobox-run.exe"
    Delete /REBOOTOK "$APPDATA\KokoroBox\tasks\kokorobox-runner-params.json"
    Delete /REBOOTOK "$APPDATA\KokoroBox\tasks\kokorobox-elevated-deep-links.json"
    Delete /REBOOTOK "$APPDATA\KokoroBox\tasks\kokorobox-elevated-task.json"
    Delete /REBOOTOK "$APPDATA\KokoroBox\tasks\kokorobox-elevated.xml"

  nsExec::ExecToLog '"$SYSDIR\schtasks.exe" /Delete /TN "${KOKOROBOX_ELEVATED_TASK_NAME}" /F'
  Pop $R2
!macroend

!macro customInit
  !insertmacro EnsureTempSpace
  StrCpy $kokoroboxServiceWasRunning "false"
  ${If} $installMode == "all"
    ${If} ${UAC_IsAdmin}
      !insertmacro StopServiceIfRunning "${LEGACY_SERVICE_NAME}"
      !insertmacro StopServiceIfRunning "${KOKOROBOX_SERVICE_NAME}"
    ${EndIf}
  ${EndIf}
!macroend

!macro customInstall
  !insertmacro RemoveLegacyElevationArtifacts

  ${ifNot} ${isUpdated}
    CreateShortcut "$DESKTOP\${PRODUCT_FILENAME}.lnk" "$INSTDIR\${PRODUCT_FILENAME}.exe"
  ${endIf}

  ${If} $installMode == "all"
    !insertmacro EnsureAppRoutingFirewall

    ${If} $kokoroboxServiceWasRunning == "true"
      StrCpy $R1 "$INSTDIR\resources\files\kokorobox-service.exe"
      ${If} ${FileExists} "$R1"
        DetailPrint "Migrating and starting KokoroBox service: $R1"
        nsExec::ExecToLog '"$R1" service install'
        Pop $R2
        ${If} $R2 != 0
          DetailPrint "KokoroBox service install exited with code $R2"
        ${EndIf}
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

!macro customUnInstall
  !insertmacro RemoveLegacyElevationArtifacts
  ${If} $installMode == "all"
    !insertmacro RemoveAppRoutingFirewall
  ${EndIf}
!macroend

!endif
