function middleware(iob, currenttemp, glucose, profile, autosens, meal, reservoir, clock, pumphistory, preferences, basal_profile, oref2_variables) {

function round(value, digits) {
        if (! digits) { digits = 0; }
        var scale = Math.pow(10, digits);
        return Math.round(value * scale) / scale; 
    }

// The function will increase the SMBs is COB = 60 (which generally means >60 COB) and high ROC.   

//  User-defined Mealboost variables        
         var Mealboost_SMB_UAM_Minutes_Increase = 15; // Standard SMB/UAM Increase
         var Mealboost_SMB_UAM_Minutes_Increase_HIGH = 30; // High BG SMB/UAM Increase
         var Mealboost_SMB_UAM_Minutes_Increase_ACCEL = 45; // High BG Rate of Change SMB/UAM Increase 
         var Mealboost_SMB_DeliveryRatio_Increase_ACCEL = .75; // High BG Rate of Change SMB Delivery Ratio  
         
        
//  Initialize function variables
  

// The Constant Carb Absorption Function

  // Reduce hourly carb absorption to 5-minute carb absoorption
     min_5m_carbabsorption = min_hourly_carb_absorption / (60 / 5);

  // Calculate the dynamic min_5m_carbimpact
   min_5m_carbimpact = (min_5m_carbabsorption * isf) / carb_factor;
  
  profile.min_5m_carbimpact = round(min_5m_carbimpact,2);
 
return "The min_5m_carbimpact has been adjusted to: " + round(profile.min_5m_carbimpact, 2) + ".";


}
