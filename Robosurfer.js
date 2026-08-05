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

// **************** CONFIGURATION ****************
var CONFIG = {
    // Main feature toggle
    enableMiddleware: true,
    
    // Sleep Mode  
    sleepMode: {
        startHour: 21,
        endHour: 3,
        bgThreshold: 140,
        targetIncrease: 10,
        hypoTargetIncrease: 40,
        hypoIOBThreshold: 0.1
    }
};

// **************** UTILITY FUNCTIONS ****************

function isTimeInWindow(currentTime, startHour, endHour) {
    var start = new Date(currentTime);
    start.setHours(startHour, 0, 0, 0);
    var end = new Date(currentTime);
    end.setHours(endHour, 0, 0, 0);
    
    return ((currentTime >= start && currentTime <= end) || 
            (currentTime <= start && currentTime <= end && start > end) ||
            (currentTime >= start && currentTime >= end && start > end));
}

// **************** SLEEP MODE ****************

function applySleepMode(currentTime, currentBG, iob, profile, target) {
    var sleepModeStatus = "";
    
    if (isTimeInWindow(currentTime, CONFIG.sleepMode.startHour, CONFIG.sleepMode.endHour) && 
        currentBG <= CONFIG.sleepMode.bgThreshold) {
        
        // Turn off SMBs and raise target by 10
        profile.enableUAM = false;
        profile.enableSMB_always = false;
        profile.enableSMB_with_COB = false;
        profile.enableSMB_after_carbs = false;
        profile.enableSMB_with_temptarget = false;
        profile.enableSMB_high_bg = false;
        var newTarget = target + CONFIG.sleepMode.targetIncrease;
        sleepModeStatus = "SLEEP MODE ON";
        
        // Check for negative IOB (graduated hypo protection)
        if (iob <= CONFIG.sleepMode.hypoIOBThreshold) {
            newTarget = newTarget + CONFIG.sleepMode.hypoTargetIncrease; // Add 40 MORE (total +50)
            
            // Graduated basal factor based on IOB level and current BG
            var basalFactor;
            
            if (currentBG > 140) {
                basalFactor = 0.95;
                sleepModeStatus = "SLEEP MODE ON; NEGATIVE BASAL MODE ON (Recovery)";
            } else if (iob <= -0.2) {
                basalFactor = 0.6;
                sleepModeStatus = "SLEEP MODE ON; NEGATIVE BASAL MODE ON (Severe)";
            } else if (iob <= -0.1) {
                basalFactor = 0.75;
                sleepModeStatus = "SLEEP MODE ON; NEGATIVE BASAL MODE ON (Moderate)";
            } else if (iob <= -0.05) {
                basalFactor = 0.85;
                sleepModeStatus = "SLEEP MODE ON; NEGATIVE BASAL MODE ON (Mild)";
            } else {
                basalFactor = 0.9;
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

// **************** MAIN MIDDLEWARE FUNCTION ****************

// Safety check for glucose array
if (!glucose || glucose.length < 4) {
    return "Error: Insufficient glucose data (need at least 4 readings)";
}

// Only proceed if middleware is enabled
if (!CONFIG.enableMiddleware) {
    return "Middleware disabled";
}

// Initialize state variables
var currentBG = glucose[0].glucose;
var target = profile.min_bg;
var initialISF = profile.sens;
var initialCR = profile.carb_ratio;
var initialCSF = initialISF / initialCR;
// ISF/CR as prepare/profile.js left them; used to back-compute the carb floor for
// reporting. Captured here because initialISF/initialCR are mutated by overrides below.
var reportISF = profile.sens;
var reportCR = profile.carb_ratio;
var currentBasal = profile.current_basal;
var oldBasal = currentBasal;
var iobValue = iob[0].iob;
var past2hoursAverage = profile.dynamicVariables.past2hoursAverage;
var average_total_data = profile.dynamicVariables.average_total_data;

// Initialize log variables
var logSleepMode = "";

// **************** PROFILE OVERRIDES ****************
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
    
    // NOTE: Basal is already adjusted by iAPS in the current_basal variable
    if (overrideTarget >= 80) target = overrideTarget;
    if (adjustISF) initialISF = round(initialISF / overridePercentage, 0);
    if (adjustCR) initialCR = round(initialCR / overridePercentage, 2);
    
    // Recalculate CSF after potential ISF/CR changes
    initialCSF = initialISF / initialCR;
    
    if (smbisOff) {
        profile.enableUAM = false;
        profile.enableSMB_always = false;
        profile.enableSMB_with_COB = false;
        profile.enableSMB_after_carbs = false;
        profile.enableSMB_with_temptarget = false;
        profile.enableSMB_high_bg = false;
    }
    if (overrideMaxIOB) {
        profile.max_iob = profilesMaxIOB;
    }
    
    // Reset override flags after processing
    profile.dynamicVariables.useOverride = false;
    profile.dynamicVariables.overridePercentage = 100;
}

// Initialize working variables AFTER profile overrides
var newISF = initialISF;
var newCR = initialCR;
var hypoMode = false;

// **************** APPLY SLEEP MODE ****************
var sleepMode = applySleepMode(now, currentBG, iobValue, profile, target);
target = sleepMode.newTarget;
logSleepMode = sleepMode.status;

// Handle hypo mode from sleep mode
if (sleepMode.hypoMode) {
    currentBasal = round(currentBasal * sleepMode.newBasalFactor, 2);
    newISF = round(initialISF / 0.95, 0); // Stronger ISF (divide by 0.95)
    newCR = round(initialCR / 0.95, 2); // Stronger CR (divide by 0.95)
    hypoMode = true;
}

// Calculate CSF
var checkCSF = 0;
if (newCR > 0 && newISF > 0) {
    checkCSF = newISF / newCR;
} else {
    checkCSF = initialCSF;
}

// **************** SET PROFILE VALUES ****************
profile.current_basal = currentBasal;
profile.sens = newISF;
profile.carb_ratio = newCR;
profile.min_bg = target;
profile.max_bg = target;
profile.target_bg = target;

// **************** CARB FLOOR (REPORTING ONLY) ****************
// min_5m_carbimpact is derived in prepare/profile.js from the preference read as
// grams per hour, and meal.js consumed it several steps before this middleware runs.
// Recomputing here would have no effect and would report a figure not in force.
// Back-computes the applied floor using the ISF/CR prepare/profile.js used:
//   g/hr = min_5m_carbimpact * CR / ISF * 12
var carbFloorGramsPerHour = (reportISF > 0 && reportCR > 0)
    ? profile.min_5m_carbimpact * reportCR / reportISF * 12
    : 0;

// **************** RETURN DETAILED STATUS ****************
return logSleepMode + 
       ". Override " + logOverride + 
       ". ISF was/now " + round(initialISF, 2) + "/" + round(profile.sens, 2) + 
       " Basal was/now " + oldBasal + "/" + profile.current_basal + 
       ". CR was/now " + initialCR + "/" + round(profile.carb_ratio, 2) + 
       " CSF was/now " + round(initialCSF, 2) + "/" + round(checkCSF, 2) + 
       ". Max IOB " + round(profile.max_iob, 2) +
       ". Carb floor " + round(carbFloorGramsPerHour, 1) + " g/hr (impact " + profile.min_5m_carbimpact + 
       " ISF " + round(reportISF, 0) + " CR " + round(reportCR, 1) + ")" +
       ". TDD " + round(past2hoursAverage, 2) + " 2week TDD " + round(average_total_data, 2);

}
