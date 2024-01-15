function middleware(iob, currenttemp, glucose, profile, autosens, meal, reservoir, clock, pumphistory, preferences, basal_profile, oref2_variables) {

   function round(value, digits) {
        if (! digits) { digits = 0; }
        var scale = Math.pow(10, digits);
        return Math.round(value * scale) / scale; 
    }   

// NIGHTBOOST FUNCTION
//Turn on or off
  var enable_nightboost = true;

//Only use when enable_robotune = true.
    if (enable_nightboost) { 

//  Initialize user-defined settings
// Thresholds
   var NightBoostStartTimeHour = 20; // 8pm
   var NightBoostStartTimeMinute = 0; // 8:00pm
   var NightBoostCarbThreshold = 30; // COB
   var NightBoostBGThreshold = 140; // BG over
   var NightBoostROCThreshold = 0; // TBD  

// Increases     
   var NightBoostISF = .25 // Standard Nightboost ISF % Increase
   var NightBoostISF_ROC = .5 // High ROC Nightboost ISF % Increase    
   var NightBoostSMBUAMMinutes = 15; // Standard Nightboost SMB/UAM Increase
   var NightBoostSMBUAMMinutes_ROC = 30; // High ROC Nightboost SMB/UAM Increase
       
       
//  Initialize function variables
   var myGlucose = glucose[0].glucose;
   var target = profile.min_bg;
   var isf = profile.sens;
   var COB = meal.carbs;    
   var maxSMB = profile.maxSMBBasalMinutes
   var maxUAM = profile.maxUAMSMBBasalMinutes     
   const now = new Date();
   const NightBoostStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0, 0); // 8:00 PM
   var ROC = 0;    

  if (now > NightBoostStart && COB > NightBoostCarbThreshold && myGlucose > NightBoostBGThreshold) {
   
      profile.sens = 


     
     if (ROC >= NightBoostROCThreshold) {
         profile.maxSMBBasalMinutes = maxSMB + NightBoostSMBUAMMinutesROC
         profile.maxUAMSMBBasalMinutes = maxUAM + + NightBoostSMBUAMMinutesROC
        }
    
  }
}

// increase SMBs 
// Increase SMB delivery ratio scaling
// Decrease carb absorption
// Decrease ISF

       
       

   return "_ set to: " + round(_, 2);
    } 
}
