@echo off
setlocal
if "%~1"=="" (
    echo Drag and drop a .mpp file onto this batch file or run:
    echo convert_mpp.bat "C:\path\to\your_project.mpp"
    pause
    exit /b 1
)

echo Parsing MPP file: %~1
python "%~dp0scripts\parse_mpp.py" "%~1" > "%~dpn1_converted.json"

if %ERRORLEVEL% EQU 0 (
    echo [Success] Output JSON created at:
    echo "%~dpn1_converted.json"
) else (
    echo [Failed] Error parsing MPP file.
)

endlocal
