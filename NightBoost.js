// WORK IN PROGRESS

function middleware(iob, currenttemp, glucose, profile, autosens, meal, reservoir, clock, pumphistory, preferences, basal_profile, oref2_variables) {

   function round(value, digits) {
        if (! digits) { digits = 0; }
        var scale = Math.pow(10, digits);
        return Math.round(value * scale) / scale; 
    }   

// NIGHTBOOST FUNCTION
//Turn on or off
  var enable_nightboost = true;

//Only use when enable_robotune = true
if (enable_nightboost) { 

   // Initialize Function Variables
   // Thresholds
      var NightBoost_StartTimeHour = 17; // 8pm
      var NightBoost_StartTimeMinute = 0; // 8:00pm
      var NightBoost_CarbThreshold = 40; // COB
      var NightBoost_BGThreshold = 140; // BG over
      var NightBoost_ROCThreshold = 0; // TBD  

   // User-defined Settings Increases     
      var ISF_CR_NightBoost = .25; // Standard Nightboost ISF % Increase
      var ISF_CR_ROC_NightBoost = .5; // High ROC Nightboost ISF % Increase    
      var SMBUAMMinutes_NightBoost = 15; // Standard Nightboost SMB/UAM Increase
      var SMBUAMMinutes_ROC_NightBoost = 30; // High ROC Nightboost SMB/UAM Increase
      var SMBDeliveryRatio_NightBoost = 1; // Nightboost SMB Delivery Ratio  
      var COB_Max_Nightboost = 100; // Nightboost COB_Max
           
   //  Initialize function variables
      var NightBoost_Status = "Off";
      var myGlucose = glucose[0].glucose;
      var target = profile.min_bg;
      var isf = profile.sens;
      var cr = profile.carb_ratio;
      var csf = isf/cr; 
      var max_COB = profile.maxCOB;   
      var maxSMB = profile.maxSMBBasalMinutes;
      var maxUAM = profile.maxUAMSMBBasalMinutes;  
      var SMBDeliveryRatio = profile.smb_delivery_ratio; 
      var COB = meal.mealCOB; 
      const now = new Date();
      const NightBoostStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), NightBoost_StartTimeHour, NightBoost_StartTimeMinute, 0); 
      var ROC = 0;    

      //Add BG Rate of Change Function


      if (now >= NightBoostStart && 
          myGlucose > NightBoost_BGThreshold &&
          COB > NightBoost_CarbThreshold) {
            
            var NightBoost_Status = "On";
            profile.sens = isf - (isf * ISF_CR_NightBoost);
            profile.carb_ratio = (cr / (1 + ISF_CR_NightBoost));  
            var check_csf = profile.sens / profile.carb_ratio;
            profile.maxSMBBasalMinutes = maxSMB + SMBUAMMinutes_NightBoost;   
            profile.maxUAMSMBBasalMinutes = maxUAM + SMBUAMMinutes_NightBoost;   
            profile.smb_delivery_ratio = SMBDeliveryRatio_NightBoost;
            profile.maxCOB = COB_Max_Nightboost; 
            var min_carb_absorption = 11; // Option to change carb absorption e.g. slower after bedtime after late meals. Assumes use of constant_carb_absorption function
            
          //   if (ROC >= NightBoostROCThreshold) {
          //      profile.sens = 
          //      profile.maxSMBBasalMinutes = maxSMB + NightBoostSMBUAMMinutesROC
          //     profile.maxUAMSMBBasalMinutes = maxUAM + + NightBoostSMBUAMMinutesROC 
          //    }
       
        }
   
return "Nightboost Status: :" + NightBoost_Status + "Nightboost Start Time: " + NightBoostStart + " ISF: "  + round(profile.sens, 2) + " CR: "  + round(profile.carb_ratio, 2) + " CSF Check: Profile: "  + round(csf, 2) + " New: " + round(check_csf, 2) + " SMB Minutes: "  + round(profile.maxSMBBasalMinutes, 2) + " UAM Minutes: "  + round(profile.maxUAMSMBBasalMinutes, 2) + " SMB Delivery Ratio: "  + round(profile.smb_delivery_ratio, 2) + " Max COB: "  + round(profile.maxCOB, 2) + " Min Absorption: "  + round(min_carb_absorption, 2);
}       

  
} 

