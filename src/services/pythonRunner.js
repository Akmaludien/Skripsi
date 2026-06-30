const { exec } = require('child_process');
const path = require('path');

function runPrediction() {
    const pythonCmd = process.env.PYTHON_CMD || 'python';
    // Path to predict.py relative to the root folder (where app runs)
    const scriptPath = path.join(__dirname, '..', '..', 'python_scripts', 'predict.py');
    
    console.log('[Cron] Running prediction...');
    exec(`${pythonCmd} "${scriptPath}"`, { timeout: 300000 }, (err, stdout, stderr) => {
        if (stdout) {
            console.log('[Cron] Prediction output:\n' + stdout.trim());
        }
        if (stderr) {
            const tfNoise = ['onednn', 'cuda', 'tensorflow', 'deprecationwarning', 'absl::', 'initializelog', 'i0000', 'w0000', 'cudart_stub', 'xl_flags', 'tf_cpp', 'xla'];
            const realErrors = stderr.split('\n')
                .filter(l => l.trim() && !tfNoise.some(p => l.toLowerCase().includes(p)))
                .join('\n');
            if (realErrors.trim()) {
                console.error('[Cron] Prediction stderr:', realErrors.trim().substring(0, 500));
            }
        }
        if (err) {
            console.error('[Cron] Prediction process exited with error:', err.message);
        }
    });
}

module.exports = {
    runPrediction
};
