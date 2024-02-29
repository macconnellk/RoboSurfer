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
         
// The Mealboost Function

   //Increased Rate of Change (1.6mg/dl per minute)
             if (glucoseRateOfChange_3Periods > 1.6) {
             
                //105-139 (Max: 2.1, AF 1)
                if ((myGlucose >= Automation_1_BGThreshold_1 && myGlucose < Automation_1_BGThreshold_2)) {  
                      // Set Nightboost Threshold 3 Factors    
                     Automation_Status = Automation_1_name + " OnROCMax2.1";   
                     NightBoost_Sigmoid_Min = Automation_1_minimumRatio_5;
                     NightBoost_Sigmoid_Max = Automation_1_maximumRatio_5;
                     NightBoost_Sigmoid_AF = Automation_1_adjustmentFactor_5;
                     new_maxSMB = maxSMB + Automation_1_SMB_UAM_Minutes_Increase_HIGH;   
                     new_maxUAM = maxUAM + Automation_1_SMB_UAM_Minutes_Increase_HIGH;
                     profile.smb_delivery_ratio = Automation_1_SMB_DeliveryRatio_Increase_ACCEL;
                }
             
                  // 140+ ((Max: 2.1, AF 1)
                  if (myGlucose >= Automation_1_BGThreshold_2) {
                     // Set Nightboost Threshold 3 Factors    
                     Automation_Status = Automation_1_name + " OnROCMax2.1";
                     NightBoost_Sigmoid_Min = Automation_1_minimumRatio_5;
                     NightBoost_Sigmoid_Max = Automation_1_maximumRatio_5;
                     NightBoost_Sigmoid_AF = Automation_1_adjustmentFactor_5;
                     new_maxSMB = maxSMB + Automation_1_SMB_UAM_Minutes_Increase_HIGH;   
                     new_maxUAM = maxUAM + Automation_1_SMB_UAM_Minutes_Increase_HIGH;
                     profile.smb_delivery_ratio = Automation_1_SMB_DeliveryRatio_Increase_ACCEL;
                  }
             }
                
            //High Rate of Change (4mg/dl per minute)
             if (glucoseRateOfChange_2Periods > 4 || glucoseRateOfChange_3Periods > 4) {  

                   //105-139 (Max: 2.25, AF 1)
                  if ((myGlucose >= Automation_1_BGThreshold_1 && myGlucose < Automation_1_BGThreshold_2)) {  
                        // Set Nightboost Threshold 4 Factors with Acceleration    
                        Automation_Status = Automation_1_name + " OnHighROCMax2.25";
                        NightBoost_Sigmoid_Min = Automation_1_minimumRatio_6;
                        NightBoost_Sigmoid_Max = Automation_1_maximumRatio_6;
                        NightBoost_Sigmoid_AF = Automation_1_adjustmentFactor_6;
                        new_maxSMB = maxSMB + Automation_1_SMB_UAM_Minutes_Increase_ACCEL;   
                        new_maxUAM = maxUAM + Automation_1_SMB_UAM_Minutes_Increase_ACCEL;
                        profile.smb_delivery_ratio = Automation_1_SMB_DeliveryRatio_Increase_ACCEL;
                }

                   // 140+ ((Max: 2.25, AF 1)
                  if (myGlucose >= Automation_1_BGThreshold_2) {
                     // Set Nightboost Threshold 4 Factors with Acceleration    
                     Automation_Status = Automation_1_name + " On HighROCMax2.25";
                     NightBoost_Sigmoid_Min = Automation_1_minimumRatio_6;
                     NightBoost_Sigmoid_Max = Automation_1_maximumRatio_6;
                     NightBoost_Sigmoid_AF = Automation_1_adjustmentFactor_6;
                     new_maxSMB = maxSMB + Automation_1_SMB_UAM_Minutes_Increase_ACCEL;   
                     new_maxUAM = maxUAM + Automation_1_SMB_UAM_Minutes_Increase_ACCEL;
                     profile.smb_delivery_ratio = Automation_1_SMB_DeliveryRatio_Increase_ACCEL;
                  }
                
                }
 
return "The min_5m_carbimpact has been adjusted to: " + round(profile.min_5m_carbimpact, 2) + ".";


}
