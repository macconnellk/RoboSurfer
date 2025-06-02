function middleware(iob, currenttemp, glucose, profile, autosens, meal, reservoir, clock) {

// DECLARE NOW IMMEDIATELY - before any other code
var now = new Date();

   // Define utility functions
         function round_basal(basal) {
             var lowest_rate_scale = 20;
             var rounded_basal = basal;
             if (basal < 1) {
                 rounded_basal = Math.round(basal * lowest_rate_scale) / lowest_rate_scale;
             }
             else if (basal < 10) {
                 rounded_basal = Math.round(basal * 20) / 20; 
             }
             else {
                 rounded_basal = Math.round(basal * 10) / 10; 
             }
               return rounded_basal;
         }
   
         function round(value, digits) {
              if (! digits) { digits = 0; }
              var scale = Math.pow(10, digits);
              return Math.round(value * scale) / scale; 
          }

// **************** ROBOSURFER CONFIGURATION ****************
var CONFIG = {
    // Main feature toggles
    enableRoboSurfer: true,
    enableNightProtect: true,
    enableDynamicCR: true,
    enableSigmoidISF: true,
    enableAutomation1: true,
    enableMealboost: true,
    
    // Sensor Safety
    sensorSafety: {
        maxDeltaTick: 37,
        maxDataGapMinutes: 12,
        maxTwoReadingGapMinutes: 17
    },
    
    // Carb Safety
    carbSafety: {
        targetIncrease: 30,
        timeWindowMinutes: 30,
        bgThreshold: 161,
        cobThreshold: 65
    },
    
    // Dynamic ISF Sigmoid
    sigmoid: {
        minimumRatio: 0.99,
        maximumRatio: 1.075,
        adjustmentFactor: 0.35,
        bgConversionFactor: 0.0555
    },
    
    // Dynamic CR
    dynamicCR: {
        power: 25, // percent
        disableTimeMinutes: 10 // disable if carbs entered in last X minutes
    },
    
    // Night Protection
    nightProtect: {
        bgThreshold: 105,
        basalFactor: 0.85,
        startHour: 21,
        endHour: 3,
        targetIncrease: 10,
        hypoTargetIncrease: 20,
        hypoBasalFactor: 0.95,
        hypoIOBThreshold: 0.05
    },
    
    // Sleep Mode  
    sleepMode: {
        startHour: 21,
        endHour: 3,
        bgThreshold: 140
    },
    
    // Automation 1 (Nightboost)
    automation1: {
        name: "Nightboost",
        startHour: 20,
        endHour: 1,
        lessAggressiveHour: 23,
        target: 120,
        bgThreshold1: 105,
        bgThreshold2: 140,
        carbThreshold: 0,
        smbUAMIncrease: 15,
        
        // Sigmoid settings for different thresholds
        threshold1: {
            minimumRatio: 0.5,
            maximumRatio: 1.05,
            adjustmentFactor: 0.5
        },
        threshold2: {
            minimumRatio: 0.5,
            maximumRatio: 1.1,
            adjustmentFactor: 0.5
        }
    },
    
    // Mealboost
    mealboost: {
        startHour: 0,
        endHour: 18,
        endMinute: 59,
        cobThreshold: 50,
        bgThreshold: 105,
        rocThreshold: 1.6,
        highROCThreshold: 4,
        smbUAMIncrease: 15,
        smbUAMIncreaseHigh: 30,
        smbUAMIncreaseAccel: 30,
        deliveryRatioHigh: 0.75,
        deliveryRatioAccel: 0.85
    },
    
    // Time conversion constants
    time: {
        minutesToMs: 60 * 1000,
        fiveMinutesToHour: 60 / 5
    }
};

// **************** UTILITY FUNCTIONS ****************

function isTimeInWindow(currentTime, startHour, endHour) {
    // Create time objects for start and end times
    var start = new Date(currentTime);
    start.setHours(startHour, 0, 0, 0);
    var end = new Date(currentTime);
    end.setHours(endHour, 0, 0, 0);
    
    // Match the original complex logic exactly
    return ((currentTime >= start && currentTime <= end) || 
            (currentTime <= start && currentTime <= end && start > end) ||
            (currentTime >= start && currentTime >= end && start > end));
}

function sigmoidFunction(adjustmentFactor, minimumRatio, maximumRatio, currentBG, target) {
    // Safety checks for input parameters
    if (!adjustmentFactor || adjustmentFactor <= 0) adjustmentFactor = CONFIG.sigmoid.adjustmentFactor;
    if (!minimumRatio || minimumRatio <= 0) minimumRatio = CONFIG.sigmoid.minimumRatio;
    if (!maximumRatio || maximumRatio <= minimumRatio) maximumRatio = CONFIG.sigmoid.maximumRatio;

    // Calculate sigmoid components
    var ratioInterval = maximumRatio - minimumRatio;
    var maxMinusOne = maximumRatio - 1;
    
    // Safety check for maxMinusOne
    if (maxMinusOne <= 0) maxMinusOne = 0.075;

    var deviation = (currentBG - target) * CONFIG.sigmoid.bgConversionFactor;
    
    // Makes sigmoid factor = 1 when BG deviation = 0
    var fixOffset = (Math.log10(1/maxMinusOne - minimumRatio/maxMinusOne) / Math.log10(Math.E));
    
    // Safety check for fixOffset
    if (!isFinite(fixOffset)) fixOffset = 0;
    
    // Calculate exponent
    var exponent = deviation * adjustmentFactor + fixOffset;
    
    // Safety check for exponent (prevent extreme values)
    if (exponent > 50) exponent = 50;
    if (exponent < -50) exponent = -50;

    // The sigmoid function
    var sigmoidFactor = ratioInterval / (1 + Math.exp(-exponent)) + minimumRatio;

    // Respect min/max ratios and safety check
    sigmoidFactor = Math.max(Math.min(maximumRatio, sigmoidFactor), minimumRatio);
    
    // Final safety check
    if (!isFinite(sigmoidFactor) || sigmoidFactor <= 0) sigmoidFactor = 1;

    return sigmoidFactor;
}

// **************** SAFETY FUNCTIONS ****************

function applySensorSafety(glucose, profile) {
    var sensorSafetyStatus = "Off";
    
    // Extract glucose values and times
    var glucoseNow = glucose[0].glucose;
    var glucosePrev1 = glucose[1].glucose;
    var glucosePrev2 = glucose[2].glucose;
    var glucosePrev3 = glucose[3].glucose;
    
    // Parse time data
    var glucoseTimeArray = [];
    glucose.forEach(element => {
        glucoseTimeArray.push(new Date(element.dateString));
    });
    
    var currentTime = glucoseTimeArray[0].getTime();
    var prevTime1 = glucoseTimeArray[1].getTime();
    var prevTime2 = glucoseTimeArray[2].getTime();
    
    // Calculate differences and time gaps
    var glucoseDiffNow = glucoseNow - glucosePrev1;
    var glucoseDiffPrior = glucosePrev1 - glucosePrev2;
    var timeDiffNow = (currentTime - prevTime1) / CONFIG.time.minutesToMs;
    var timeDiff2Periods = (currentTime - prevTime2) / CONFIG.time.minutesToMs;
    
    // Check safety thresholds
    if (timeDiffNow >= CONFIG.sensorSafety.maxDataGapMinutes || 
        timeDiff2Periods >= CONFIG.sensorSafety.maxTwoReadingGapMinutes || 
        glucoseDiffNow >= CONFIG.sensorSafety.maxDeltaTick || 
        glucoseDiffPrior >= CONFIG.sensorSafety.maxDeltaTick) {
        
        sensorSafetyStatus = "On(DataGap/2ReadingGap/CurrentTick/PrevTick): " + 
                           round(timeDiffNow,0) + "/" + round(timeDiff2Periods,0) + "/" + 
                           round(glucoseDiffNow,0) + "/" + round(glucoseDiffPrior,0);
        
        profile.enableUAM = false;
        profile.enableSMB_always = false;
        
        return { status: sensorSafetyStatus, disableFeatures: true };
    }
    
    return { status: sensorSafetyStatus, disableFeatures: false };
}

function applyCarbSafety(lastCarbTime, currentBG, cob, target, profile) {
    var carbSafetyStatus = "Off";
    var nowMs = Date.now();
    var carbTimeThreshold = lastCarbTime + (CONFIG.carbSafety.timeWindowMinutes * CONFIG.time.minutesToMs);
    
    // Check if carbs were entered recently AND BG is under threshold AND COB > threshold
    if (nowMs <= carbTimeThreshold && lastCarbTime != 0 && 
        currentBG < CONFIG.carbSafety.bgThreshold && cob > CONFIG.carbSafety.cobThreshold) {
        
        // Disable SMBs and UAMs
        profile.enableUAM = false;
        profile.enableSMB_always = false;
        
        // Raise target
        var newTarget = target + CONFIG.carbSafety.targetIncrease;
        
        // Calculate minutes since carbs for logging
        var minutesSinceCarbs = Math.round((nowMs - lastCarbTime) / CONFIG.time.minutesToMs);
        carbSafetyStatus = "On: SMBs disabled 30min, target +" + CONFIG.carbSafety.targetIncrease + " (CarbsAgo:" + minutesSinceCarbs + "min, COB:" + round(cob, 1) + ")";
        
        return { status: carbSafetyStatus, newTarget: newTarget, active: true };
    }
    
    return { status: carbSafetyStatus, newTarget: target, active: false };
}

function applySleepMode(currentTime, currentBG, iob, profile, target) {
    var sleepModeStatus = "";
    
    // Sleep mode uses nightProtect timing but checks against Automation_1_BGThreshold_2 (140)
    if (isTimeInWindow(currentTime, CONFIG.nightProtect.startHour, CONFIG.nightProtect.endHour) && 
        currentBG <= CONFIG.automation1.bgThreshold2) {  // Uses 140
        
        // Turn off SMBs and raise target by 10
        profile.enableUAM = false;
        profile.enableSMB_always = false;
        var newTarget = target + CONFIG.nightProtect.targetIncrease; // Add 10 first
        sleepModeStatus = "SLEEP MODE ON";
        
        // Check for negative IOB (graduated hypo protection)
        if (iob <= CONFIG.nightProtect.hypoIOBThreshold) { // Now 0.1 instead of 0.05
            newTarget = newTarget + CONFIG.nightProtect.hypoTargetIncrease; // Add 40 MORE (total +50)
            
            // Graduated basal factor based on IOB level and current BG
            var basalFactor;
            var grad = CONFIG.nightProtect.graduatedResponse;
            
            if (currentBG > grad.recoveryBG) {
                // BG > 140: Return to near-normal basal to allow IOB recovery
                basalFactor = grad.recoveryFactor; // 0.95
                sleepModeStatus = "SLEEP MODE ON; NEGATIVE BASAL MODE ON (Recovery)";
            } else if (iob <= grad.severeIOB) {
                // Very negative IOB: Most aggressive protection
                basalFactor = grad.severeFactor; // 0.6
                sleepModeStatus = "SLEEP MODE ON; NEGATIVE BASAL MODE ON (Severe)";
            } else if (iob <= grad.moderateIOB) {
                // Moderate negative IOB
                basalFactor = grad.moderateFactor; // 0.75
                sleepModeStatus = "SLEEP MODE ON; NEGATIVE BASAL MODE ON (Moderate)";
            } else if (iob <= grad.mildIOB) {
                // Mild negative IOB
                basalFactor = grad.mildFactor; // 0.85
                sleepModeStatus = "SLEEP MODE ON; NEGATIVE BASAL MODE ON (Mild)";
            } else {
                // Light negative IOB
                basalFactor = grad.lightFactor; // 0.9
                sleepModeStatus = "SLEEP MODE ON; NEGATIVE BASAL MODE ON (Light)";
            }
            
            return { 
                status: sleepModeStatus, 
                newTarget: newTarget, 
                hypoMode: true,
                newBasalFactor: basalFactor
            };
        }
        
        return { status: sleepModeStatus, newTarget: newTarget, hypoMode: false };
    }
    
    return { status: sleepModeStatus, newTarget: target, hypoMode: false };
}

function applyNightboost(currentTime, currentBG, cob, target, maxSMB, maxUAM, profile) {
    var automationStatus = "Off";
    var newTarget = target;
    var newMaxSMB = maxSMB;
    var newMaxUAM = maxUAM;
    var sigmoidParams = null;
    
    // Check if conditions are met for Nightboost (matches original exactly)
    if (isTimeInWindow(currentTime, CONFIG.automation1.startHour, CONFIG.automation1.endHour) &&
        currentBG > CONFIG.automation1.bgThreshold2 && 
        cob >= CONFIG.automation1.carbThreshold) {
        
        newTarget = CONFIG.automation1.target; // Set to 120
        
        // Default to threshold 2 settings (baseline nightboost)
        automationStatus = CONFIG.automation1.name + " OnMax1.1";
        sigmoidParams = {
            min: CONFIG.automation1.threshold2.minimumRatio,   // 0.5
            max: CONFIG.automation1.threshold2.maximumRatio,   // 1.1  
            af: CONFIG.automation1.threshold2.adjustmentFactor // 0.5
        };
        newMaxSMB = maxSMB + CONFIG.automation1.smbUAMIncrease; // +15
        newMaxUAM = maxUAM + CONFIG.automation1.smbUAMIncrease; // +15
        
        // Check for less aggressive time (OVERRIDES the default settings)
        if (isTimeInWindow(currentTime, CONFIG.automation1.lessAggressiveHour, CONFIG.automation1.endHour)) {
            automationStatus = CONFIG.automation1.name + " On1.2(LessAggressive)"; // Match original status string exactly
            sigmoidParams = {
                min: CONFIG.automation1.threshold1.minimumRatio,   // 0.5
                max: CONFIG.automation1.threshold1.maximumRatio,   // 1.05
                af: CONFIG.automation1.threshold1.adjustmentFactor // 0.5
            };
            // SMB/UAM settings remain the same (+15)
            // Reset SMB delivery ratio to original value (get fresh value from profile)
            var originalDeliveryRatio = profile.smb_delivery_ratio || 0.3;
            profile.smb_delivery_ratio = round(originalDeliveryRatio, 2);
        }
    }
    
    return {
        status: automationStatus,
        newTarget: newTarget,
        newMaxSMB: newMaxSMB,
        newMaxUAM: newMaxUAM,
        sigmoidParams: sigmoidParams
    };
}

function applyMealboost(currentTime, currentBG, cob, roc2Periods, roc3Periods, originalMaxSMB, originalMaxUAM, profile) {
    var mealboostStatus = "Off";
    var newMaxSMB = originalMaxSMB;  
    var newMaxUAM = originalMaxUAM;
    
    // Use the SAME complex time logic as original (even though it's not needed for 0:00-18:59)
    var mealboostStart = new Date(currentTime);
    mealboostStart.setHours(CONFIG.mealboost.startHour, 0, 0, 0);
    var mealboostEnd = new Date(currentTime);
    mealboostEnd.setHours(CONFIG.mealboost.endHour, CONFIG.mealboost.endMinute, 0, 0);
    
    // Match original complex time checking exactly
    if (((currentTime >= mealboostStart && currentTime <= mealboostEnd) || 
         (currentTime <= mealboostStart && currentTime <= mealboostEnd && mealboostStart > mealboostEnd) ||
         (currentTime >= mealboostStart && currentTime >= mealboostEnd && mealboostStart > mealboostEnd)) &&
        currentBG > CONFIG.mealboost.bgThreshold) {
        
        // Check for increased rate of change (1.6mg/dl per minute)
        if (cob > CONFIG.mealboost.cobThreshold && roc3Periods > CONFIG.mealboost.rocThreshold) {
            
            if (currentBG >= CONFIG.mealboost.bgThreshold && currentBG < 139) {
                mealboostStatus = "Mealboost:OnROC<140";
                newMaxSMB = originalMaxSMB + CONFIG.mealboost.smbUAMIncrease;  // Uses original maxSMB
                newMaxUAM = originalMaxUAM + CONFIG.mealboost.smbUAMIncrease;
            } else if (currentBG >= 140) {
                mealboostStatus = "Mealboost:OnROC140+";
                newMaxSMB = originalMaxSMB + CONFIG.mealboost.smbUAMIncrease;  
                newMaxUAM = originalMaxUAM + CONFIG.mealboost.smbUAMIncrease;
            }
        }
        
        // Check for high rate of change (4mg/dl per minute) - this OVERRIDES the above
        if (cob > CONFIG.mealboost.cobThreshold && 
            (roc2Periods > CONFIG.mealboost.highROCThreshold || roc3Periods > CONFIG.mealboost.highROCThreshold)) {
            
            if (currentBG >= CONFIG.mealboost.bgThreshold && currentBG < 139) {
                mealboostStatus = "Mealboost:OnHIGHROC<140";
                newMaxSMB = originalMaxSMB + CONFIG.mealboost.smbUAMIncreaseHigh;  
                newMaxUAM = originalMaxUAM + CONFIG.mealboost.smbUAMIncreaseHigh;
            } else if (currentBG >= 140) {
                mealboostStatus = "Mealboost:OnHIGHROC140+";
                newMaxSMB = originalMaxSMB + CONFIG.mealboost.smbUAMIncreaseAccel; 
                newMaxUAM = originalMaxUAM + CONFIG.mealboost.smbUAMIncreaseAccel;
                profile.smb_delivery_ratio = CONFIG.mealboost.deliveryRatioHigh;  
            }
        }
    }
    
    // Calculate change from original maxSMB (matches original exactly)
    var mealboostSMBChange = newMaxSMB - originalMaxSMB;
    
    return {
        status: mealboostStatus,
        newMaxSMB: newMaxSMB,
        newMaxUAM: newMaxUAM,
        smbChange: mealboostSMBChange
    };
}

function applyDynamicCR(lastCarbTime, dynamicISFRatio, initialCR) {
    var nowMs = Date.now();
    var carbTimeThreshold = lastCarbTime + (CONFIG.dynamicCR.disableTimeMinutes * CONFIG.time.minutesToMs);
    
    // If carbs entered recently, don't adjust CR (matching original exactly)
    if (nowMs <= carbTimeThreshold && lastCarbTime != 0) {
        return initialCR;
    }
    
    // Adjust CR based on Dynamic ISF ratio if enabled (matching original logic exactly)
    if (CONFIG.enableDynamicCR && dynamicISFRatio > 1) {  // Only adjust if ratio > 1
        var crFactor = dynamicISFRatio;
        crFactor = ((crFactor - 1) * (CONFIG.dynamicCR.power / 100)) + 1;
        return round(initialCR / crFactor, 1);
    }
    
    return initialCR;
}

function applyConstantCarbAbsorption(minHourlyCarbAbsorption, newISF, newCR, profile) {
    // Convert hourly to 5-minute absorption
    var min5mCarbAbsorption = minHourlyCarbAbsorption / CONFIG.time.fiveMinutesToHour;
    
    // Calculate dynamic min_5m_carbimpact with safety checks
    var min5mCarbImpact = 0;
    if (newISF > 0 && newCR > 0) {
        min5mCarbImpact = (min5mCarbAbsorption * newISF) / newCR;
    } else {
        min5mCarbImpact = profile.min_5m_carbimpact; // Fallback to original value
    }
    
    profile.min_5m_carbimpact = round(min5mCarbImpact, 2);
    
    return min5mCarbImpact;
}

// **************** MAIN MIDDLEWARE FUNCTION ****************

// Safety check for glucose array
if (!glucose || glucose.length < 4) {
    return "Error: Insufficient glucose data (need at least 4 readings)";
}

// Only proceed if RoboSurfer is enabled
if (!CONFIG.enableRoboSurfer) {
    return "RoboSurfer disabled";
}

// Initialize state variables
var currentBG = glucose[0].glucose;
var target = profile.min_bg;
var initialISF = profile.sens;
var initialCR = profile.carb_ratio;
var initialCSF = initialISF / initialCR;
var currentBasal = profile.current_basal;
var oldBasal = currentBasal;
var cob = meal.mealCOB || 0;
var iobValue = iob[0].iob;
var maxCOB = profile.maxCOB;
var maxSMB = profile.maxSMBBasalMinutes;
var maxUAM = profile.maxUAMSMBBasalMinutes;
var lastCarbTime = meal.lastCarbTime || 0;
// Initialize log variables
var logProfileAlert = "";
var logSleepMode = "";

// Handle profile overrides (complete logic from original)
var useOverride = profile.dynamicVariables ? profile.dynamicVariables.useOverride : false;
var adjustISF = profile.dynamicVariables ? profile.dynamicVariables.isf : false;
var adjustCR = profile.dynamicVariables ? profile.dynamicVariables.cr : false;
var overridePercentage = profile.dynamicVariables ? (profile.dynamicVariables.overridePercentage / 100) : 1;
var overrideTarget = profile.dynamicVariables ? profile.dynamicVariables.overrideTarget : target;
var smbisOff = profile.dynamicVariables ? profile.dynamicVariables.smbisOff : false;
var overrideMaxIOB = profile.dynamicVariables ? profile.dynamicVariables.overrideMaxIOB : false;
var profilesMaxIOB = profile.dynamicVariables ? profile.dynamicVariables.maxIOB : profile.max_iob;

if (useOverride) {
    logOverride = "On";
    
    // NOTE: Basal is already adjusted by iAPS in the current_basal variable, no adjustment needed here
    if (overrideTarget >= 80) target = overrideTarget;
    if (adjustISF) initialISF = round(initialISF / overridePercentage, 0);
    if (adjustCR) initialCR = round(initialCR / overridePercentage, 2);
    
    // Recalculate CSF after potential ISF/CR changes
    initialCSF = initialISF / initialCR;
    
    if (smbisOff) {
        profile.enableUAM = false;
        profile.enableSMB_always = false;
    }
    if (overrideMaxIOB) {
        profile.max_iob = profilesMaxIOB;
    }
    
    // Reset override flags after processing
    profile.dynamicVariables.useOverride = false;
    profile.dynamicVariables.overridePercentage = 100;
}

// Handle profile overrides (complete logic from original)
var logOverride = "Off";
var useOverride = profile.dynamicVariables ? profile.dynamicVariables.useOverride : false;
var adjustISF = profile.dynamicVariables ? profile.dynamicVariables.isf : false;
var adjustCR = profile.dynamicVariables ? profile.dynamicVariables.cr : false;
var overridePercentage = profile.dynamicVariables ? (profile.dynamicVariables.overridePercentage / 100) : 1;
var overrideTarget = profile.dynamicVariables ? profile.dynamicVariables.overrideTarget : target;
var smbisOff = profile.dynamicVariables ? profile.dynamicVariables.smbisOff : false;
var overrideMaxIOB = profile.dynamicVariables ? profile.dynamicVariables.overrideMaxIOB : false;
var profilesMaxIOB = profile.dynamicVariables ? profile.dynamicVariables.maxIOB : profile.max_iob;

if (useOverride) {
    logOverride = "On";
    
    if (overrideTarget >= 80) target = overrideTarget;
    if (adjustISF) initialISF = round(initialISF / overridePercentage, 0);
    if (adjustCR) initialCR = round(initialCR / overridePercentage, 2);
    
    // Recalculate CSF after potential ISF/CR changes
    initialCSF = initialISF / initialCR;
    
    if (smbisOff) {
        profile.enableUAM = false;
        profile.enableSMB_always = false;
    }
    if (overrideMaxIOB) {
        profile.max_iob = profilesMaxIOB;
    }
    
    // Reset override flags
    profile.dynamicVariables.useOverride = false;
    profile.dynamicVariables.overridePercentage = 100;
}

// Initialize working variables AFTER profile overrides (using potentially modified initial values)
var dynamicISFRatio = 1;
var newISF = initialISF;  // Must use potentially modified initialISF
var newCR = initialCR;    // Must use potentially modified initialCR
var newMaxSMB = maxSMB;
var newMaxUAM = maxUAM;
var newMaxCOB = maxCOB;
var checkCSF = 0;
var hypoMode = false;

// Feature enable flags (can be dynamically disabled by safety functions)
var enableAutomation1 = CONFIG.enableAutomation1;
var enableMealboost = CONFIG.enableMealboost;

// Initialize result variables with proper defaults
var sensorSafety = { status: "Off", disableFeatures: false };
var carbSafety = { status: "Off", newTarget: target, active: false };
var sleepMode = { status: "", newTarget: target, hypoMode: false };
var nightboostResult = { status: "Off", sigmoidParams: null };
var mealboostResult = { status: "Off", smbChange: 0 };

// Calculate rate of change values - ensure all time calculations use proper variables
var glucose0Time = new Date(glucose[0].dateString).getTime();
var glucose2Time = new Date(glucose[2].dateString).getTime();
var glucose3Time = new Date(glucose[3].dateString).getTime();
var timeDiff2Periods = (glucose0Time - glucose2Time) / CONFIG.time.minutesToMs;
var timeDiff3Periods = (glucose0Time - glucose3Time) / CONFIG.time.minutesToMs;
var glucoseRateOfChange2Periods = (glucose[0].glucose - glucose[2].glucose) / timeDiff2Periods;
var glucoseRateOfChange3Periods = (glucose[0].glucose - glucose[3].glucose) / timeDiff3Periods;

// Apply safety functions IN ORDER - target gets modified cumulatively
sensorSafety = applySensorSafety(glucose, profile);

// Sensor safety disables features BEFORE they run (matching original)
if (sensorSafety.disableFeatures) {
    enableAutomation1 = false;
    enableMealboost = false;
}

carbSafety = applyCarbSafety(lastCarbTime, currentBG, cob, target, profile);
target = carbSafety.newTarget; // Update target with carb safety changes

sleepMode = applySleepMode(now, currentBG, iobValue, profile, target);
target = sleepMode.newTarget; // Update target with sleep mode changes  
logSleepMode = sleepMode.status;

// Handle hypo mode from sleep mode (using graduated basal factors)
if (sleepMode.hypoMode) {
    enableAutomation1 = false; // Disable nightboost in hypo mode
    currentBasal = round(currentBasal * sleepMode.newBasalFactor, 2); // Use graduated factor
    newISF = round(initialISF / 0.95, 0); // Stronger ISF (divide by 0.95)
    newCR = round(initialCR / 0.95, 2); // Stronger CR (divide by 0.95)
    dynamicISFRatio = 1; // Reset sigmoid factor
    hypoMode = true; // Flag to skip normal ISF calculation later
}

// Apply Dynamic ISF Sigmoid if enabled (initial calculation, may be overridden by Nightboost)
if (CONFIG.enableSigmoidISF) {
    dynamicISFRatio = sigmoidFunction(CONFIG.sigmoid.adjustmentFactor, CONFIG.sigmoid.minimumRatio, 
                                    CONFIG.sigmoid.maximumRatio, currentBG, target);
}

// Apply Nightboost if enabled (this REPLACES the dynamic ISF ratio when active, matching original)
if (enableAutomation1) {
    nightboostResult = applyNightboost(now, currentBG, cob, target, maxSMB, maxUAM, profile);
    
    if (nightboostResult.sigmoidParams) {
        target = nightboostResult.newTarget;
        newMaxSMB = nightboostResult.newMaxSMB;
        newMaxUAM = nightboostResult.newMaxUAM;
        
        // REPLACE dynamic ISF with Nightboost sigmoid (matching original behavior)
        dynamicISFRatio = sigmoidFunction(nightboostResult.sigmoidParams.af, 
                                        nightboostResult.sigmoidParams.min,
                                        nightboostResult.sigmoidParams.max, 
                                        currentBG, target);
    }
}

// Apply Mealboost if enabled (uses ORIGINAL SMB values, may override nightboost)
if (enableMealboost) {
    mealboostResult = applyMealboost(now, currentBG, cob, glucoseRateOfChange2Periods, 
                                   glucoseRateOfChange3Periods, maxSMB, maxUAM, profile);
    // If mealboost is active, it REPLACES nightboost SMB settings (matching original behavior)
    if (mealboostResult.status !== "Off") {
        newMaxSMB = mealboostResult.newMaxSMB;
        newMaxUAM = mealboostResult.newMaxUAM;
    }
}

// Calculate new ISF (unless already set by hypo mode)
if (!hypoMode) {
    if (dynamicISFRatio > 0 && isFinite(dynamicISFRatio)) {
        newISF = initialISF / dynamicISFRatio;
        newISF = round(newISF, 0);
    } else {
        newISF = initialISF;
    }
}

// Apply Dynamic CR (unless already set by hypo mode)
if (!hypoMode) {
    newCR = applyDynamicCR(lastCarbTime, dynamicISFRatio, initialCR);
}

// Calculate CSF (after all ISF/CR modifications are complete)
if (newCR > 0 && newISF > 0) {
    checkCSF = newISF / newCR;
} else {
    checkCSF = initialCSF;
}

// Apply constant carb absorption
var minHourlyCarbAbsorption = profile.min_5m_carbimpact || 0; // Add safety fallback
applyConstantCarbAbsorption(minHourlyCarbAbsorption, newISF, newCR, profile);

// Calculate carb absorption check
var checkCarbAbsorption = 0;
if (profile.min_5m_carbimpact && profile.carb_ratio > 0 && profile.sens > 0) {
    checkCarbAbsorption = ((profile.min_5m_carbimpact * profile.carb_ratio) / profile.sens) * CONFIG.time.fiveMinutesToHour;
}

// Set profile values
profile.current_basal = currentBasal;
profile.sens = newISF;
profile.carb_ratio = newCR;
profile.maxSMBBasalMinutes = newMaxSMB;
profile.maxUAMSMBBasalMinutes = newMaxUAM;
profile.maxCOB = newMaxCOB;

// Set autosens ratio to 1 to prevent further ISF adjustments
autosens.ratio = 1;

// Create time strings for logging (matching original format)
var automationStartTime = new Date(now);
automationStartTime.setHours(CONFIG.automation1.startHour, 0, 0);
var automationEndTime = new Date(now);
automationEndTime.setHours(CONFIG.automation1.endHour, 0, 0);

// Return comprehensive status (matching original format exactly)
return logSleepMode + logProfileAlert + ". dISF ratio " + round(dynamicISFRatio, 2) + 
       ". Override" + logOverride + ". ISF was/now " + round(initialISF, 2) + "/ " + round(profile.sens, 2) + 
       " Basal was/now " + oldBasal + "/ " + profile.current_basal + 
       ". dCR(" + CONFIG.dynamicCR.power + "% " + CONFIG.enableDynamicCR + ") was/now " + initialCR + "/ " + round(profile.carb_ratio, 2) + 
       " CSF was/now " + round(initialCSF, 2) + "/ " + round(checkCSF, 2) + 
       ". SMB Deliv. Ratio " + profile.smb_delivery_ratio + 
       " Sensor Safety " + sensorSafety.status + 
       " Carb Safety " + carbSafety.status + 
       " AUTOMATION1 " + nightboostResult.status + 
       " " + automationStartTime.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) + 
       " to " + automationEndTime.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) + 
       ". SMB Mins " + round(profile.maxSMBBasalMinutes, 2) + 
       " UAM Mins " + round(profile.maxUAMSMBBasalMinutes, 2) + 
       " Max COB " + round(profile.maxCOB, 2) + 
       ". MinAbsorp(CI) " + round(checkCarbAbsorption, 2) + "(" + profile.min_5m_carbimpact + ")" + 
       " Mealboost " + mealboostResult.status + " SMB+" + mealboostResult.smbChange;

}
