const tf = require('@tensorflow/tfjs');
const fs = require('fs');
const path = require('path');

let modelAWS = null;
let modelARG = null;
let scalerAWS = null;
let scalerARG = null;

async function initModels() {
    try {
        console.log("[ML Inference] Starting model initialization...");
        const awsModelPath = path.join(__dirname, '../models/aws_aaws/tfjs/model.json');
        const argModelPath = path.join(__dirname, '../models/arg/tfjs/model.json');
        const awsScalerPath = path.join(__dirname, '../models/aws_aaws/scaler_aws.json');
        const argScalerPath = path.join(__dirname, '../models/arg/scaler_arg.json');

        if (fs.existsSync(awsModelPath)) {
            modelAWS = await tf.loadLayersModel(`file://${awsModelPath}`);
            console.log("[ML Inference] Model AWS loaded successfully.");
        } else {
            console.warn(`[ML Warn] AWS model not found at ${awsModelPath}`);
        }

        if (fs.existsSync(argModelPath)) {
            modelARG = await tf.loadLayersModel(`file://${argModelPath}`);
            console.log("[ML Inference] Model ARG loaded successfully.");
        } else {
            console.warn(`[ML Warn] ARG model not found at ${argModelPath}`);
        }

        if (fs.existsSync(awsScalerPath)) {
            scalerAWS = JSON.parse(fs.readFileSync(awsScalerPath, 'utf8'));
        }
        
        if (fs.existsSync(argScalerPath)) {
            scalerARG = JSON.parse(fs.readFileSync(argScalerPath, 'utf8'));
        }

        console.log("[ML Inference] Initialization complete.");
    } catch (err) {
        console.error("[ML Error] Failed to initialize models:", err.message);
    }
}

function fillNullValues(data, defaults) {
    for (let i = 0; i < data.length; i++) {
        Object.keys(defaults).forEach(key => {
            if (data[i][key] === null || data[i][key] === undefined || isNaN(data[i][key])) {
                data[i][key] = (i === 0) ? defaults[key] : data[i - 1][key];
            }
        });
    }
    return data;
}

function scaleValue(val, min, max) {
    if (max - min === 0) return 0;
    return (val - min) / (max - min);
}

function inverseScaleValue(val, min, max) {
    return (val * (max - min)) + min;
}

async function predictWeather(stationType, dataHistoris) {
    try {
        if (!dataHistoris || dataHistoris.length < 14) {
            console.warn(`[ML Warn] Data historis kurang dari 14 hari (${dataHistoris?.length || 0} rows) untuk ${stationType}. Prediksi dibatalkan.`);
            return null;
        }

        let inputData = dataHistoris.slice(-14);

        const defaults = (stationType === 'AWS' || stationType === 'AAWS')
            ? { RR_MA3: 0, RR_lag1: 0, TAVG: 25, RH_AVG: 80 }
            : { RR_MA3: 0, RR_lag1: 0 };
        
        inputData = fillNullValues(inputData, defaults);

        const model = (stationType === 'AWS' || stationType === 'AAWS') ? modelAWS : modelARG;
        const scaler = (stationType === 'AWS' || stationType === 'AAWS') ? scalerAWS : scalerARG;

        if (!model || !scaler) {
            throw new Error(`Model atau scaler untuk ${stationType} belum ter-load.`);
        }

        const features = (stationType === 'AWS' || stationType === 'AAWS') 
            ? ['RR_MA3', 'RR_lag1', 'TAVG', 'RH_AVG']
            : ['RR_MA3', 'RR_lag1'];

        const predictionScaled = tf.tidy(() => {
            const scaledArray = inputData.map(row => {
                return features.map((feat, index) => {
                    const min = scaler.data_min_[index];
                    const max = scaler.data_max_[index];
                    return scaleValue(row[feat], min, max);
                });
            });

            const tensorInput = tf.tensor3d([scaledArray]);
            return model.predict(tensorInput).arraySync()[0][0]; 
        });

        const targetMin = scaler.data_min_[0];
        const targetMax = scaler.data_max_[0];
        
        let finalRainfall = inverseScaleValue(predictionScaled, targetMin, targetMax);
        
        return Math.max(0, finalRainfall); 

    } catch (error) {
        console.error(`[ML Error] Kegagalan pada predictWeather (${stationType}):`, error.message);
        return null;
    }
}

module.exports = { initModels, predictWeather };
