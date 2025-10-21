@echo off
pushd "%~dp0"
python shared-memo.py %*
pause
popd
