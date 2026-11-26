@echo off
setlocal DisableDelayedExpansion
if not defined ANS_APPROVED_NPM_NODE_EXE exit /b 1
"%ANS_APPROVED_NPM_NODE_EXE%" %*
