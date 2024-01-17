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
      var ISF_CR_NightBoostIncrease = .25; // Standard Nightboost ISF % Increase
      var ISF_CR_ROC_NightBoostIncrease = .5; // High ROC Nightboost ISF % Increase    
      var SMBUAMMinutes_NightBoostIncrease = 15; // Standard Nightboost SMB/UAM Increase
      var SMBUAMMinutes_ROC_NightBoostIncrease = 30; // High ROC Nightboost SMB/UAM Increase
      var SMBDeliveryRatio_NightBoostIncrease = 1; // Nightboost SMB Delivery Ratio  
      var COB_Max_NightboostIncrease = 100; // Nightboost COB_Max
           
   //  Initialize function variables
      var NightBoost_Status = "Off";
      var myGlucose = glucose[0].glucose;
      var target = profile.min_bg;
      var isf_NightBoostStart = profile.sens;
      var cr_NightboostStart = profile.carb_ratio;
      var csf_NightboostStart = isf_NightBoostStart / cr_NightboostStart; 
      var max_COB = profile.maxCOB;   
      var maxSMB = profile.maxSMBBasalMinutes;
      var maxUAM = profile.maxUAMSMBBasalMinutes;  
      var SMBDeliveryRatio_NightBoostStart = profile.smb_delivery_ratio; 
      var COB = meal.mealCOB; 
      const now = new Date();
      const NightBoostStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), NightBoost_StartTimeHour, NightBoost_StartTimeMinute, 0); 
      var ROC = 0;  
      var NightBoosted_isf = 0;
      var NightBoosted_cr = 0;
      var check_csf = 0;

      //Add BG Rate of Change Function

      if (now >= NightBoostStart && 
          myGlucose > NightBoost_BGThreshold &&
          COB > NightBoost_CarbThreshold) {
            
            var NightBoost_Status = "On";
            var NightBoosted_isf = isf_NightBoostStart - (isf_NightBoostStart * ISF_CR_NightBoostIncrease);
            var NightBoosted_cr = NightBoosted_isf / csf_NightboostStart;
            profile.sens = NightBoosted_isf;
            profile.carb_ratio = NightBoosted_cr;  
            var check_csf = profile.sens / profile.carb_ratio;
            profile.maxSMBBasalMinutes = maxSMB + SMBUAMMinutes_NightBoostIncrease;   
            profile.maxUAMSMBBasalMinutes = maxUAM + SMBUAMMinutes_NightBoostIncrease;   
            profile.smb_delivery_ratio = SMBDeliveryRatio_NightBoostIncrease;
            profile.maxCOB = COB_Max_NightboostIncrease; 
            var min_carb_absorption = 12; // Option to change carb absorption e.g. slower after bedtime after late meals. Assumes use of constant_carb_absorption function
            
          //   if (ROC >= NightBoostROCThreshold) {
          //      profile.sens = 
          //      profile.maxSMBBasalMinutes = maxSMB + NightBoostSMBUAMMinutesROC
          //     profile.maxUAMSMBBasalMinutes = maxUAM + + NightBoostSMBUAMMinutesROC 
          //    }
       
        }
   
return "Nightboost Status: :" + NightBoost_Status + "Nightboost Start Time: " + NightBoostStart + " ISF: "  + round(profile.sens, 2) + " CR: "  + round(profile.carb_ratio, 2) + " CSF Check: Profile: "  + round(csf, 2) + " New: " + round(check_csf, 2) + " SMB Minutes: "  + round(profile.maxSMBBasalMinutes, 2) + " UAM Minutes: "  + round(profile.maxUAMSMBBasalMinutes, 2) + " SMB Delivery Ratio: "  + round(profile.smb_delivery_ratio, 2) + " Max COB: "  + round(profile.maxCOB, 2) + " Min Absorption: "  + round(min_carb_absorption, 2);
}       

  
} 

