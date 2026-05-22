@echo off
title STMKG Prediction Runner
echo ====================================================
echo   STMKG MONITORING - AUTOMATED PREDICTION TASK
echo ====================================================
echo [%date% %time%] Starting prediction update...

:: Gunakan Python 3.12 venv (dengan TensorFlow)
"C:\Users\NET\venv312\Scripts\python.exe" predict.py

echo.
echo [%date% %time%] Prediction update finished.
echo ====================================================
timeout /t 0
