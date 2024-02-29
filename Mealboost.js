function middleware(iob, currenttemp, glucose, profile, autosens, meal, reservoir, clock, pumphistory, preferences, basal_profile, oref2_variables) {

function round(value, digits) {
        if (! digits) { digits = 0; }
        var scale = Math.pow(10, digits);
        return Math.round(value * scale) / scale; 
    }

// The function will increase the SMBs is COB = 60 (which generally means >60 COB) and high ROC.   

//  User-defined Mealboost variables        
         var Mealboost_SMB_UAM_Minutes_Increase = 15; // High ROC Standard SMB/UAM Increase
         var Mealboost_SMB_UAM_Minutes_Increase_HIGH = 30; // High BG High ROC SMB/UAM Increase
         var Mealboost_SMB_UAM_Minutes_Increase_ACCEL = 45; // High BG Very High ROC SMB/UAM Increase 
         var Mealboost_SMB_DeliveryRatio_Increase_ACCEL = .75; // High BG Rate of Change SMB Delivery Ratio  
         
// The Mealboost Function

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
