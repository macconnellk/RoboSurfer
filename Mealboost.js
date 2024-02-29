function middleware(iob, currenttemp, glucose, profile, autosens, meal, reservoir, clock, pumphistory, preferences, basal_profile, oref2_variables) {

function round(value, digits) {
        if (! digits) { digits = 0; }
        var scale = Math.pow(10, digits);
        return Math.round(value * scale) / scale; 
    }

        
// The function will increase the SMBs is COB = 60 (which generally means >60 COB) and high ROC.   
 // Automation #1 Thresholds
      // Define the start time and end time
      const Mealboost_start_time = new Date(now);
      Mealboost_start_time.setHours(0, 0, 0); // Assuming the start time is 12:00 AM

      const Mealboost_end_time = new Date(now);
      Mealboost_end_time.setHours(19, 59, 0); // Assuming the end time is 7:59 PM

        
//  User-defined Mealboost variables        
         var Mealboost_SMB_UAM_Minutes_Increase = 15; // High ROC Standard SMB/UAM Increase
         var Mealboost_SMB_UAM_Minutes_Increase_HIGH = 30; // High BG High ROC SMB/UAM Increase
         var Mealboost_SMB_UAM_Minutes_Increase_ACCEL = 45; // High BG Very High ROC SMB/UAM Increase 
         var Mealboost_SMB_DeliveryRatio_Increase_ACCEL = .75; // High BG Rate of Change SMB Delivery Ratio  
         
// The Mealboost Function

if (enable_Mealboost) { 

            // Check if the current time is within the specified range, greater than BG threshold and COB threshold
          if (((now >= Mealboost_start_time && now <= Mealboost_end_time) || (now <= Mealboost_start_time && now <= Mealboost_end_time && Mealboost_start_time > Mealboost_end_time) ||
             (now >= Mealboost_start_time && now >= Mealboost_end_time && Mealboost_start_time > Mealboost_end_time))
             && myGlucose > 105) 
          {
        
   //Increased Rate of Change (1.6mg/dl per minute)
             if (cob = 60 && glucoseRateOfChange_3Periods > 1.6) {
             
                //105-139 
                if ((myGlucose >= 105 && myGlucose < 139)) {  
                     Mealboost_Status = "Mealboost:OnROC<140"
                     new_maxSMB = maxSMB + Automation_1_SMB_UAM_Minutes_Increase;   
                     new_maxUAM = maxUAM + Automation_1_SMB_UAM_Minutes_Increase;
                }
             
                  // 140+ 
                  if (myGlucose >= 140) {
                     Mealboost_Status = "Mealboost:OnROC140+"
                     new_maxSMB = maxSMB + Automation_1_SMB_UAM_Minutes_Increase_HIGH;   
                     new_maxUAM = maxUAM + Automation_1_SMB_UAM_Minutes_Increase_HIGH;
                     profile.smb_delivery_ratio = Automation_1_SMB_DeliveryRatio_Increase_ACCEL;
                  }
             }
                
            //High Rate of Change (4mg/dl per minute)
             if (cob = 60 && (glucoseRateOfChange_2Periods > 4 || glucoseRateOfChange_3Periods > 4)) {  

                   //105-139 
                  if ((myGlucose >= 105 && myGlucose < 139)) {      
                        Mealboost_Status = "Mealboost:OnHIGHROC<140"
                        new_maxSMB = maxSMB + Automation_1_SMB_UAM_Minutes_Increase_HIGH;   
                        new_maxUAM = maxUAM + Automation_1_SMB_UAM_Minutes_Increase_HIGH;
                        profile.smb_delivery_ratio = Automation_1_SMB_DeliveryRatio_Increase_ACCEL;
                }

                   // 140+ 
                  if (myGlucose >= 140) {   
                     Mealboost_Status = "Mealboost:OnHIGHROC140+"
                     new_maxSMB = maxSMB + Automation_1_SMB_UAM_Minutes_Increase_ACCEL;   
                     new_maxUAM = maxUAM + Automation_1_SMB_UAM_Minutes_Increase_ACCEL;
                     profile.smb_delivery_ratio = Automation_1_SMB_DeliveryRatio_Increase_ACCEL;
                  }
                
                }
 
return "The min_5m_carbimpact has been adjusted to: " + round(profile.min_5m_carbimpact, 2) + ".";


}
