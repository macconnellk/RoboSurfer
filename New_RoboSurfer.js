function middleware(iob, currenttemp, glucose, profile, autosens, meal, reservoir, clock, dynamicVariables) {

   // Define various functions used later on, in the main function
         // Round Basal
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

// RoboSurfer is my own compilation of other individual Middleware capabilites.  RoboSurfer currently includes:
// 1) Sigmoid with optional Adjustable TDD Response
// 2) Robosens  
// 3) Scale SMB Delivery Ratio
// 4) Constant Minimum Carb Absorption
// 5) Settings automations
//    a) Nightboost

//RoboSurfer uses Sigmoid Dynamic ISF.  Settings are made here within the code.  
//Within iAPS, Dynamic and Sigmoid must be toggled on, AF set to .1 and AS Min/Max set to .999/1.001. This runs the new ISF through the native Sigmoid but with no effect.     
   
//Turn RoboSurfer and functions on or off
  var enable_RoboSurfer = true;
 
  var enable_robosens = true;
      var robosens_power = 100; // percent
  var enable_nightProtect = true; 
  var enable_dynamic_cr = false;
      var dCR_power = 25; // percent
  
   var enable_new_sigmoidTDDFactor = true;
  var enable_Automation_1 = true; 
  var enable_Automation_1_ROC = true;
  var enable_smb_delivery_ratio_scaling = false;
  var enable_Mealboost = true; 


         // Sensor Safety: if data gaps or high BG delta, disable SMBs, UAMs, and smb_delivery_ratio_scaling. 
            // Calculate glucose rate of change per minute using same data
         var sensor_safety_status = "Off";
         var maxDeltaTick = 37; // single BG tick greater than x
         var SensorSafetyGlucoseTime = [];
         var SensorSafetyGlucose_Now = glucose[0].glucose;
         var SensorSafetyGlucose_Prev1 = glucose[1].glucose;
         var SensorSafetyGlucose_Prev2 = glucose[2].glucose;
         var SensorSafetyGlucose_Prev3 = glucose[3].glucose;
   
         // Separate glucose datestring elements into array
         glucose.forEach(element => {
             SensorSafetyGlucoseTime.push(new Date(element.dateString)); // Parse datestring to date object
         });  
         
         var glucoseDiff_Now = SensorSafetyGlucose_Now - SensorSafetyGlucose_Prev1; // Difference in glucose for current period 
         var glucoseDiff_PriorPeriod = SensorSafetyGlucose_Prev1 - SensorSafetyGlucose_Prev2;  // Difference in glucose of prior period
         var glucoseDiff_2Periods = SensorSafetyGlucose_Now - SensorSafetyGlucose_Prev2; // Difference in glucose of last 2 periods
         var glucoseDiff_3Periods = SensorSafetyGlucose_Now - SensorSafetyGlucose_Prev3; // Difference in glucose of last 3 periods 
         
         var currentTime = SensorSafetyGlucoseTime[0].getTime(); 
         var prevTime1 = SensorSafetyGlucoseTime[1].getTime();
         var prevTime2 = SensorSafetyGlucoseTime[2].getTime();
         var prevTime3 = SensorSafetyGlucoseTime[3].getTime();
         var timeDiff_Now = (currentTime - prevTime1) / (1000 * 60); // Time elapsed for current period (normal = ~5 minutes)
         var timeDiff_2Periods = (currentTime - prevTime2) / (1000 * 60); // Time elapsed of last 2 periods (normal = ~10 minutes)
         var timeDiff_3Periods = (currentTime - prevTime3) / (1000 * 60); //Time elapsed of last 3 periods (normal = ~15 minutes)

         var glucoseRateOfChange_Now = glucoseDiff_Now / timeDiff_Now;
         var glucoseRateOfChange_2Periods = glucoseDiff_2Periods / timeDiff_2Periods;  //normally 10 minutes
         var glucoseRateOfChange_3Periods = glucoseDiff_3Periods / timeDiff_3Periods;  //normally 15 minutes

         if (timeDiff_Now >= 12 || timeDiff_2Periods >= 17 || glucoseDiff_Now >= maxDeltaTick || glucoseDiff_PriorPeriod >= maxDeltaTick ) {      
    
                      sensor_safety_status = "On(Current Data Gap Mins(>=12)/2 Reading Data Gap Mins(>=17)/Current Glucose Tick/Prev. Glucose Tick(>=37:)  " + round(timeDiff_Now,0) + "/" + round(timeDiff_2Periods,0) + "/" + round(glucoseDiff_Now,0) + "/" + round(glucoseDiff_PriorPeriod,0);
                      profile.enableUAM = false;
                      profile.enableSMB_always = false;
                      enable_smb_delivery_ratio_scaling = false;
                      enable_Automation_1 = false;
                      enable_Mealboost = false;
       
             }
   
   //Only use Middleware when enable_RoboSurfer = true.
    if (enable_RoboSurfer) {

   //  Initialize log variables  
   var log_protectionmechanism = "Off";
   
//  Initialize APS state variables
   var myGlucose = glucose[0].glucose;
   var target = profile.min_bg;
   var initial_isf = profile.sens;
   var initial_cr = profile.carb_ratio; 
   var initial_csf = initial_isf / initial_cr; 
   var current_basal = profile.current_basal;    
   var cob = meal.mealCOB;
   var iob = iob[0].iob    
   var max_COB = profile.maxCOB;   
   var maxSMB = profile.maxSMBBasalMinutes;
   var maxUAM = profile.maxUAMSMBBasalMinutes;  
   var smb_delivery_ratio = profile.smb_delivery_ratio;

   // Adjust for Profiles       
   var logOverride = "Off"
   var useOverride = dynamicVariables.useOverride; 
   var overridePercentage = dynamicVariables.overridePercentage / 100;   
   var overrideTarget = dynamicVariables.overrideTarget;
   var smbisOff = dynamicVariables.smbisOff;  

   if (useOverride && overridePercentage == .87) {
         enable_robosens = false;
         useOverride = false;
         current_basal = round((current_basal / .87),2);
         profile.current_basal = current_basal;
         dynamicVariables.useOverride = false;
         dynamicVariables.overridePercentage = 100;
         logOverride = "Robosens Off";
         }
       
   if (useOverride) {
      logOverride = "On";
      if (overrideTarget >=80) {
         var target = overrideTarget;
         }
      var initial_isf = initial_isf / overridePercentage;
      var initial_csf = initial_isf / initial_cr; 
      var current_basal = round_basal(current_basal * overridePercentage);
      if (smbisOff) {
         profile.enableUAM = false;
         profile.enableSMB_always = false;
         }
      
      dynamicVariables.useOverride = false;
      dynamicVariables.overridePercentage = 100;     
      }  

 //  Initialize general RoboSurfer function variables      
   const now = new Date();
   var new_dynISF_ratio = 1;
   var new_isf = initial_isf;
   var new_cr = initial_cr;    
   var initial_maxSMB = maxSMB;
   var new_maxSMB = maxSMB;   
   var new_maxUAM = maxUAM;   
   var new_max_COB = max_COB;    
   var check_csf = 0;
 
      
//  Initialize ROBOSENS variables
       // Initilize function variables
         var robosens_isf = initial_isf;
         var robosens_cr = initial_cr; 
         var robosens_csf = initial_csf; 
         var now_milliseconds = Date.now(); // Current time in milliseconds
         var lastCarbTime = meal.lastCarbTime;
         var lastCarbTimePlus10Mins = lastCarbTime + (10 * 60 * 1000); // 10 minutes in milliseconds
         var my24hrGlucose = []; // create array
         var my24hrGlucoseTime = []; // create array
         var old_basal = current_basal;
         var new_basal = current_basal;
         var percentageOverTarget_Last4Hours = 0;
         var percentageOverTarget_Last8Hours = 0;
         var percentageOverTarget_Last12Hours = 0;
         var percentageOverTarget_Last16Hours = 0;
         var percentageOverTarget_Last20Hours = 0;
         var percentageOverTarget_Last24Hours = 0;
         var basalfactorFraction_4Hours = 0;
         var basalfactorFraction_8Hours = 0;
         var basalfactorFraction_12Hours = 0;
         var basalfactorFraction_16Hours = 0;
         var basalfactorFraction_20Hours = 0;
         var basalfactorFraction_24Hours = 0;
         var totalBasalfactorFraction = 0;
         var robosens_maximumPercentProfileAdjustment = 0; 

      // User-defined AUC targets for each time period in mg / dl / h (average glucose)
      // Define target average glucose levels for different time periods
      // Targets: https://docs.google.com/spreadsheets/d/1NX4tF37qDjnOZvsi8x7eB3ftryf4UAps7STKQ6OiPLU/edit?usp=sharing 
             // User-defined targets for 4, 8, 12, 16, 20, 24 lookbacks
             // 4 hour average top of range targets 
               const user_targetGlucoseLast4Hours = {0: 121, 1: 118, 2: 109, 3: 105, 4: 105, 5: 109, 6: 109, 7: 109, 8: 109, 9: 119, 10: 128, 11: 131, 12: 130, 13: 130, 14: 130, 15: 130, 16: 130, 17: 130, 18: 130, 19: 140, 20: 150, 21: 140, 22: 140, 23: 130};

             // 8 hour average top of range targets 
               const user_targetGlucoseLast8Hours = {0: 136, 1: 129, 2: 124, 3: 118, 4: 113, 5: 113, 6: 109, 7: 107, 8: 107, 9: 114, 10: 118, 11: 120, 12: 119, 13: 124, 14: 129, 15: 131, 16: 130, 17: 130, 18: 130, 19: 135, 20: 140, 21: 135, 22: 135, 23: 135};

            // 12 hour average top of range targets 
               const user_targetGlucoseLast12Hours = {0: 134, 1: 129, 2: 126, 3: 125, 4: 125, 5: 122, 6: 119, 7: 115, 8: 112, 9: 115, 10: 115, 11: 115, 12: 115, 13: 119, 14: 122, 15: 123, 16: 123, 17: 126, 18: 129, 19: 134, 20: 137, 21: 133, 22: 133, 23: 133};
   
            // 16 hour average top of range targets 
               const user_targetGlucoseLast16Hours = {0: 133, 1: 129, 2: 127, 3: 126, 4: 127, 5: 124, 6: 122, 7: 121, 8: 121, 9: 121, 10: 121, 11: 119, 12: 116, 13: 119, 14: 119, 15: 119, 16: 118, 17: 122, 18: 124, 19: 128, 20: 130, 21: 130, 22: 132, 23: 133};

            // 20 hour average top of range targets 
               const user_targetGlucoseLast20Hours = {0: 128, 1: 127, 2: 127, 3: 127, 4: 127, 5: 125, 6: 124, 7: 123, 8: 123, 9: 123, 10: 123, 11: 123, 12: 123, 13: 123, 14: 123, 15: 121, 16: 119, 17: 121, 18: 121, 19: 123, 20: 125, 21: 126, 22: 127, 23: 128};

             // 24 hour average top of range targets 
               const user_targetAverageGlucoseLast24Hours = 124;

            // 4, 8, 24, bottom of range target
                const user_bottomtargetAverageGlucose = 110;

            //Define NightProtect Basal variables   
               var nightProtect_BGThreshold = 120;
               var nightProtect_basalFactor = .75;
               // Define the start time and end time
               const nightProtect_start_time = new Date(now);
               nightProtect_start_time.setHours(21, 0, 0); // The start time is 9:00 PM
               const nightProtect_end_time = new Date(now);
               nightProtect_end_time.setHours(3, 0, 0); // The end time is 3:00 AM

      // Initialize the target variables based on current hour
             // Get the current hour
               const currentHour = new Date().getHours();

            // Select the target thresholds
               var target_averageGlucose_Last4Hours = user_targetGlucoseLast4Hours[currentHour];
               var target_averageGlucose_Last8Hours = user_targetGlucoseLast8Hours[currentHour];
               var target_averageGlucose_Last12Hours = user_targetGlucoseLast12Hours[currentHour];
               var target_averageGlucose_Last16Hours = user_targetGlucoseLast16Hours[currentHour];
               var target_averageGlucose_Last20Hours = user_targetGlucoseLast20Hours[currentHour];
               var target_averageGlucose_Last24Hours = user_targetAverageGlucoseLast24Hours;

      //  Initialize user-defined basal sigmoid function variables
               var robosens_minimumRatio = .7;
               var robosens_maximumRatio = 1.2;
               var robosens_maximumRatio_safety_threshold = 1.5;  
               var robosens_adjustmentFactor = .5;
               var robosens_adjustmentFactor_safety_threshold = 2; 
               var robosens_sigmoidFactor = 1;
               var robosens_basalFactor = 1; 
               var robosens_sens_status = "Off";
               var robosens_basal_status = "Off";
               var robosens_AF_adjustment = 0;
               var robosens_MAX_adjustment = 0;
               var dynamic_deviation_high = 160;
               var dynamic_deviation_veryhigh = 220;  

       
//  Initialize Sigmoid Enhanced with TDD Response function variables
   var minimumRatio = .99;
   var maximumRatio = 1.1; //was 1.25
   var adjustmentFactor = .75;
   var past2hoursAverage = dynamicVariables.past2hoursAverage;
   var average_total_data = dynamicVariables.average_total_data;
   var weightedAverage = dynamicVariables.weightedAverage;
       // Sensitivity Protection Mechanism: If 24hr TDD is less than 2-Week TDD (more sensitive), set weighted average TDD to the 24hr TDD value)
         if (past2hoursAverage < average_total_data) {
            weightedAverage = past2hoursAverage;
            var log_protectionmechanism = "On";
         }
         // Exception logic if past2hoursAverage not calculating
            if (past2hoursAverage < 1) {
               weightedAverage = average_total_data;
               var log_protectionmechanism = "OnZero";
            }

//  Initialize Automation #1 NIGHTBOOST function variables
      // Automation #1 Thresholds
      // Define the start time and end time
      const start_time = new Date(now);
      start_time.setHours(20, 0, 0); // Assuming the start time is 8:00 PM

      const end_time = new Date(now);
      end_time.setHours(1, 0, 0); // Assuming the end time is 12:00 AM

      const less_aggressive_time = new Date(now);
      less_aggressive_time.setHours(22, 0, 0); // Assuming the end time is 11:00 PM 
       
      var Automation_1_BGThreshold_1 = 105; // BG over 
      var Automation_1_BGThreshold_2 = 140; // BG over
      var Automation_1_BGThreshold_3 = 160; // BG over 
      var Automation_1_BGThreshold_4 = 180; // BG over
      var Automation_1_BGThreshold_5 = 200; // BG over 
      var Automation_1_BGThreshold_6 = 220; // BG over
       
      var Automation_1_CarbThreshold = 0; // COB
      var Automation_1_BG_Accel_Threshold = 0; // TBD
       
         // Automation_1 User-Defined Variables 
         var Automation_1_name = "Nightboost"; // Give the Automation a Name for use in return string
         var Automation_1_target = 120; // (Was 105)
         
         //Automation 1 Sigmoid - Threshold 1 
         var Automation_1_minimumRatio_1 = .5;
         var Automation_1_maximumRatio_1 = 1.2;
         var Automation_1_adjustmentFactor_1 = .5;

         //Automation 1 Sigmoid - Threshold 2 (Was 1.6)
         var Automation_1_minimumRatio_2 = .5;
         var Automation_1_maximumRatio_2 = 1.3;
         var Automation_1_adjustmentFactor_2 = .5;

         //Automation 1 Sigmoid - Threshold 3 
         var Automation_1_minimumRatio_3 = .5;
         var Automation_1_maximumRatio_3 = 1.5;
         var Automation_1_adjustmentFactor_3 = .5;

         //Automation 1 Sigmoid - Threshold 4 
         var Automation_1_minimumRatio_4 = .5;
         var Automation_1_maximumRatio_4 = 2;
         var Automation_1_adjustmentFactor_4 = 1;

        //Automation 1 Sigmoid - Threshold 5 
         var Automation_1_minimumRatio_5 = .5;
         var Automation_1_maximumRatio_5 = 2.2;
         var Automation_1_adjustmentFactor_5 = 1;

         //Automation 1 Sigmoid - Threshold 6 
         var Automation_1_minimumRatio_6 = .5;
         var Automation_1_maximumRatio_6 = 2.35;
         var Automation_1_adjustmentFactor_6 = 1;
       
          //Automation 1 Dynamic CR 
         var enable_Automation_1_dynamic_cr = true; // this variation of dynamic CR uses CSF to adjust CR in tandem wuth ISF. A CSF_StrengthFactor of 1 maintains the existing CSF and CR will be adjusted with ISF to maintain existing CSF.
            var Automation_1_CSF_StrengthFactor = 1; // % change factor used to calculate new CR; 1 = no change to CSF & CR will be adjusted in line with the ISF change. 1.1 is a 10% increase to CSF (i.e carbs would have a greater impact on BG) and CR will be strengthened more than ISF to achieve this.
             // Example: To reflect an increased impact of carbs at night (and slower absorption/digestion) during this time period, CSF must increase, CR would be adjusted more than ISF as a result. 
       
       //Automation 1 Other Settings
         var Automation_1_SMB_UAM_Minutes_Increase = 15; // Standard Automation #1 SMB/UAM Increase
         var Automation_1_SMB_UAM_Minutes_Increase_HIGH = 30; // High BG Automation #1 SMB/UAM Increase
         var Automation_1_SMB_UAM_Minutes_Increase_ACCEL = 45; // High BG Rate of Change Automation #1 SMB/UAM Increase
         var Automation_1_SMB_DeliveryRatio_Increase_HIGH = .55; // High BG Rate of Change SMB Delivery Ratio
         var Automation_1_SMB_DeliveryRatio_Increase_ACCEL = .6; // High BG Rate of Change SMB Delivery Ratio  
         var Automation_1_min_hourly_carb_absorption = 25; // Automation #1 min_hourly_carb_absorption. Option to change carb absorption e.g. slower after bedtime after late meals. Assumes use of constant_carb_absorption function

      // Automation_1 Initialized Function Variables    
      var Automation_Status = "Off";

// Initialize SMB Delivery Ratio Scaling variables
  var smb_delivery_ratio_min = profile.smb_delivery_ratio;
  var smb_delivery_ratio_scale_start_bg = 160;     
  var smb_delivery_ratio_max = .75;
  var smb_delivery_ratio_bg_range = 60;       
       
//  Initialize Constant Carb Absorption variables        
      // Define the minimum amount of carb you wamt iAPS to decay in 1 hour.
      var min_hourly_carb_absorption = profile.min_5m_carbimpact;;

//  Initialize Mealboost variables        

       var Mealboost_Status = "Off";
       var Mealboost_SMB_change = 0;
       
       // Define the start time and end time
      const Mealboost_start_time = new Date(now);
      Mealboost_start_time.setHours(0, 0, 0); // Assuming the start time is 12:00 AM

      const Mealboost_end_time = new Date(now);
      Mealboost_end_time.setHours(18, 59, 0); // Assuming the end time is 7:59 PM
      
//  User-defined Mealboost variables
         var Mealboost_COB_threshold = 50; 
         var Mealboost_SMB_UAM_Minutes_Increase = 15; // High ROC Standard SMB/UAM Increase
         var Mealboost_SMB_UAM_Minutes_Increase_HIGH = 30; // High BG High ROC SMB/UAM Increase
         var Mealboost_SMB_UAM_Minutes_Increase_ACCEL = 30; // High BG Very High ROC SMB/UAM Increase
         var Mealboost_SMB_DeliveryRatio_Increase_HIGH = .75; // High BG Rate of Change SMB Delivery Ratio
         var Mealboost_SMB_DeliveryRatio_Increase_ACCEL = .85; // High BG Rate of Change SMB Delivery Ratio  
       

//  **************** ROBOSURFER ENHANCEMENT #1: Dynamic ISF Sigmoid- ADJUSTS ISF BASED PN CURRENT BG  ****************
     
function sigmoidFunction(enable_new_sigmoidTDDFactor, adjustmentFactor, 
minimumRatio, maximumRatio, weightedAverage, average_total_data, past2hoursAverage) {        


   // DYNISF SIGMOID MODIFICATION #1
   // Use the robosens_sigmoidFactor as the TDD factor
   // ORIGINAL SIGMOID APPROACH: const tdd_factor = tdd_averages.weightedAverage / tdd_averages.average_total_data;
   
 if (enable_new_sigmoidTDDFactor) {
       var TDD_factor = 1; // Disable TDD Factor in dISF altogether to allow Robosens to handle resistance, use dISF for BG variation only 
   } else { 
       var TDD_factor = weightedAverage / average_total_data; // the original Sigmoid approach
          }

// The Dynamic ISF Sigmoid Code 

      var ratioInterval = maximumRatio - minimumRatio;
      var max_minus_one = maximumRatio - 1;

   // DYNISF SIGMOID MODIFICATION #2
    // The TDD delta effect in the iAPS Chris Wilson (Logarithmic) DynISF approach allows ISF to shift when BG is below target BG (unlike the original Sigmoid DynamicISF approach). 
    // The following math applies the robosens_sigmoidFactor to the target BG to this shift.
    // Like the original Sigmoid approach, Profile ISF will be applied at target but only when robosens_sigmoidFactor = 1.  
    // ORIGINAL SIGMOID APPROACH: const bg_dev = (current_bg - profile.min_bg) * 0.0555;

    if (enable_new_sigmoidTDDFactor) {
       var deviation = (myGlucose - (target / TDD_factor)) * 0.0555; 
    } else {
       var deviation = (myGlucose - target) * 0.0555; // the original Sigmoid approach
          }
       
     //Makes sigmoid factor(y) = 1 when BG deviation(x) = 0.
     var fix_offset = (Math.log10(1/max_minus_one-minimumRatio/max_minus_one) / Math.log10(Math.E));
       
     //Exponent used in sigmoid formula
     var exponent = deviation * adjustmentFactor * TDD_factor + fix_offset;
    
     // The sigmoid function
      sigmoidFactor = ratioInterval / (1 + Math.exp(-exponent)) + minimumRatio;

     //Respect min/max ratios
     sigmoidFactor = Math.max(Math.min(maximumRatio, sigmoidFactor), sigmoidFactor, minimumRatio);

      return sigmoidFactor;

}        

// **************** Initial call of the Sigmoid function to set a new autosens ratio ****************

    new_dynISF_ratio = sigmoidFunction(enable_new_sigmoidTDDFactor, adjustmentFactor, minimumRatio, maximumRatio, weightedAverage, average_total_data, past2hoursAverage);  
    
      

//  **************** END ROBOSURFER ENHANCEMENT #1: Dynamic ISF Sigmoid  ****************
       
// **************** ROBOSURFER ENHANCEMENT #2: DYNAMIC SMB DELIVERY RATIO: ADJUSTS SMB DELIVERY RATIO BASED ON CURRENT BG ****************
// Changes the setting SMB Delivery Ratio based on BG         

  if (enable_smb_delivery_ratio_scaling) {      

   // The SMB Delivery Ratio Scaling Function

     // If BG between start bg and top of BG Range, scale SMB Delivery ratio
     if (myGlucose >= smb_delivery_ratio_scale_start_bg && myGlucose <= (smb_delivery_ratio_scale_start_bg + smb_delivery_ratio_bg_range)) {
        smb_delivery_ratio = (myGlucose - smb_delivery_ratio_scale_start_bg) * ((smb_delivery_ratio_max - smb_delivery_ratio_min) / smb_delivery_ratio_bg_range) + smb_delivery_ratio_min;
      }

     // If BG above user-defined BG range, use SMB ratio max
     if (myGlucose > (smb_delivery_ratio_scale_start_bg + smb_delivery_ratio_bg_range)) {
        smb_delivery_ratio = smb_delivery_ratio_max;
      }

      // Set profile to new value
        profile.smb_delivery_ratio = round(smb_delivery_ratio,2);
     }

// **************** END ROBOSURFER ENHANCEMENT #2: DYNAMIC SMB DELIVERY RATIO **********************************************
       
// **************** ROBOSURFER ENHANCEMENT #3: AUTOMATION #1: "NIGHTBOOST: ADJUSTS ISF BASED ON TIME, CURRENT BG, and BG RATE OF CHANGE ****************
//Only use when enable_Automation_1 = true
// This function will replace the values determined in the prior Dynamic ISF and Delivery Ratio functions        
if (enable_Automation_1) { 

            // Check if the current time is within the specified range, greater than BG threshold and COB threshold
          if (((now >= start_time && now <= end_time) || (now <= start_time && now <= end_time && start_time > end_time) ||
             (now >= start_time && now >= end_time && start_time > end_time))
             && myGlucose > Automation_1_BGThreshold_1 && cob >= Automation_1_CarbThreshold) 
          {

          // Baseline Nightboost settings are below, regardless of ROC.  E.g. If it's after 8p and BG > 105, Sig Max is 1.5 and SMB/UAM is +15 mins

            target = Automation_1_target;  
            min_hourly_carb_absorption = Automation_1_min_hourly_carb_absorption; //
            
             // Set Nightboost Threshold 2 Factors (Was Threshold 2, 1.3)
                  Automation_Status = Automation_1_name + " OnMax1.3";   
                  var NightBoost_Sigmoid_Min = Automation_1_minimumRatio_2;
                  var NightBoost_Sigmoid_Max = Automation_1_maximumRatio_2;
                  var NightBoost_Sigmoid_AF = Automation_1_adjustmentFactor_2;
                  new_maxSMB = maxSMB + Automation_1_SMB_UAM_Minutes_Increase;   
                  new_maxUAM = maxUAM + Automation_1_SMB_UAM_Minutes_Increase;

         // Determine Nightboost ROC status and response        
         // E.g. If ROC is +24mg/dl in 15 mins, Sig Max is 2.2 and SMB/UAM is +30mins
         // E.g. If ROC is +40 in 10 mins, or +60 in 15 minsm Sig Max is 2.35 and SMB/UAM is +45mins 
         // Once ROC levels off, reveerts to baseline Nightboost even if BG high    
             
            //Increased Rate of Change (1.6mg/dl per minute)  (Was Threshold 5, Max2.2)
             if (glucoseRateOfChange_3Periods > 1.6 && enable_Automation_1_ROC) {
             
                //105-139 (Max: 2.2, AF 1)
                if ((myGlucose >= Automation_1_BGThreshold_1 && myGlucose < Automation_1_BGThreshold_2)) {  
                      // Set Nightboost Threshold 3 Factors    
                     Automation_Status = Automation_1_name + " OnROCMax1.5";   
                     NightBoost_Sigmoid_Min = Automation_1_minimumRatio_3;
                     NightBoost_Sigmoid_Max = Automation_1_maximumRatio_3;
                     NightBoost_Sigmoid_AF = Automation_1_adjustmentFactor_3;
                     new_maxSMB = maxSMB + Automation_1_SMB_UAM_Minutes_Increase_HIGH;   
                     new_maxUAM = maxUAM + Automation_1_SMB_UAM_Minutes_Increase_HIGH;
                     profile.smb_delivery_ratio = Automation_1_SMB_DeliveryRatio_Increase_HIGH;
                }
             
                  // 140+ ((Max: 2.1, AF 1)
                  if (myGlucose >= Automation_1_BGThreshold_2) {
                     // Set Nightboost Threshold 3 Factors    
                     Automation_Status = Automation_1_name + " OnROCMax1.5";
                     NightBoost_Sigmoid_Min = Automation_1_minimumRatio_3;
                     NightBoost_Sigmoid_Max = Automation_1_maximumRatio_3;
                     NightBoost_Sigmoid_AF = Automation_1_adjustmentFactor_3;
                     new_maxSMB = maxSMB + Automation_1_SMB_UAM_Minutes_Increase_HIGH;   
                     new_maxUAM = maxUAM + Automation_1_SMB_UAM_Minutes_Increase_HIGH;
                     profile.smb_delivery_ratio = Automation_1_SMB_DeliveryRatio_Increase_HIGH;
                  }
             }
                
            //High Rate of Change (4mg/dl per minute) (Was Threshold 6)
             if ((glucoseRateOfChange_2Periods > 4 || glucoseRateOfChange_3Periods > 4) && enable_Automation_1_ROC) {
                   //105-139 (Max: 2.35, AF 1)
                  if ((myGlucose >= Automation_1_BGThreshold_1 && myGlucose < Automation_1_BGThreshold_2)) {  
                        // Set Nightboost Threshold 4 Factors with Acceleration    
                        Automation_Status = Automation_1_name + " OnHighROCMax1.5";
                        NightBoost_Sigmoid_Min = Automation_1_minimumRatio_3;
                        NightBoost_Sigmoid_Max = Automation_1_maximumRatio_3;
                        NightBoost_Sigmoid_AF = Automation_1_adjustmentFactor_3;
                        new_maxSMB = maxSMB + Automation_1_SMB_UAM_Minutes_Increase_ACCEL;   
                        new_maxUAM = maxUAM + Automation_1_SMB_UAM_Minutes_Increase_ACCEL;
                        profile.smb_delivery_ratio = Automation_1_SMB_DeliveryRatio_Increase_HIGH;
                }

                   // 140+ ((Max: 2.35, AF 1)
                  if (myGlucose >= Automation_1_BGThreshold_2) {
                     // Set Nightboost Threshold 4 Factors with Acceleration    
                     Automation_Status = Automation_1_name + " On HighROCMax1.5";
                     NightBoost_Sigmoid_Min = Automation_1_minimumRatio_3;
                     NightBoost_Sigmoid_Max = Automation_1_maximumRatio_3;
                     NightBoost_Sigmoid_AF = Automation_1_adjustmentFactor_3;
                     new_maxSMB = maxSMB + Automation_1_SMB_UAM_Minutes_Increase_ACCEL;   
                     new_maxUAM = maxUAM + Automation_1_SMB_UAM_Minutes_Increase_ACCEL;
                     profile.smb_delivery_ratio = Automation_1_SMB_DeliveryRatio_Increase_ACCEL;
                  }
                
                }

       // LESS AGGRESSIVE TIME: Check if the current time is within the less aggressive range
             if ((now >= less_aggressive_time && now <= end_time) || (now <= less_aggressive_time && now <= end_time && start_time > end_time) ||
             (now >= less_aggressive_time && now >= end_time && less_aggressive_time > end_time)) {

                // Set Nightboost Threshold 1 Factors (Was Threshold 1, 1.2)   
                  Automation_Status = Automation_1_name + " On1.2(LessAggressive)";   
                  var NightBoost_Sigmoid_Min = Automation_1_minimumRatio_1;
                  var NightBoost_Sigmoid_Max = Automation_1_maximumRatio_1;
                  var NightBoost_Sigmoid_AF = Automation_1_adjustmentFactor_1;
                  new_maxSMB = maxSMB + Automation_1_SMB_UAM_Minutes_Increase;   
                  new_maxUAM = maxUAM + Automation_1_SMB_UAM_Minutes_Increase;
                  profile.smb_delivery_ratio = round(smb_delivery_ratio,2);

         // LESS AGGRESSIVE TIME: Determine Nightboost ROC status and response        
         // Once ROC levels off, reveerts to baseline Nightboost even if BG high    
             
            //LESS AGGRESSIVE TIME: Increased Rate of Change (1.6mg/dl per minute)
             if (glucoseRateOfChange_3Periods > 1.6) {
             
                //105-139 (Max: 1.6, AF 1) (Was Threshold 2, 1.4)
                if ((myGlucose >= Automation_1_BGThreshold_1 && myGlucose < Automation_1_BGThreshold_2)) {  
                      // Set Nightboost Threshold 2 Factors    
                     Automation_Status = Automation_1_name + " OnROCMax1.4(Less Aggressive";   
                     NightBoost_Sigmoid_Min = Automation_1_minimumRatio_2;
                     NightBoost_Sigmoid_Max = Automation_1_maximumRatio_2;
                     NightBoost_Sigmoid_AF = Automation_1_adjustmentFactor_2;
                     new_maxSMB = maxSMB + Automation_1_SMB_UAM_Minutes_Increase;   
                     new_maxUAM = maxUAM + Automation_1_SMB_UAM_Minutes_Increase;
                     profile.smb_delivery_ratio = round(smb_delivery_ratio,2);
                }
             
                  // 140+ ((Max: 1.6, AF 1)
                  if (myGlucose >= Automation_1_BGThreshold_2) {
                     // Set Nightboost Threshold 2 Factors    
                     Automation_Status = Automation_1_name + " OnROCMax1.4(Less Aggressive)";
                     NightBoost_Sigmoid_Min = Automation_1_minimumRatio_2;
                     NightBoost_Sigmoid_Max = Automation_1_maximumRatio_2;
                     NightBoost_Sigmoid_AF = Automation_1_adjustmentFactor_2;
                     new_maxSMB = maxSMB + Automation_1_SMB_UAM_Minutes_Increase;   
                     new_maxUAM = maxUAM + Automation_1_SMB_UAM_Minutes_Increase;;
                     profile.smb_delivery_ratio = round(smb_delivery_ratio,2);
                  }
             }
             

             }
             
            // Run Sigmoid Function to get new_dynISF_ratio for Automation 1  
            new_dynISF_ratio = sigmoidFunction(enable_new_sigmoidTDDFactor, NightBoost_Sigmoid_AF, NightBoost_Sigmoid_Min, NightBoost_Sigmoid_Max, weightedAverage, average_total_data, past2hoursAverage);  // New Sigmoid autosens ratio for Automation #1 that replaces initial autosens ratio
             
            // Commenting out while using dynamic ISF with Robosens 
            // Define the new automation 1 CSF 
            //if (enable_Automation_1_dynamic_cr == true) { 
            //robosens_csf = robosens_csf * Automation_1_CSF_StrengthFactor;
            // }           
             
        }       
      } 

 // **************** END ROBOSURFER ENHANCEMENT #3: AUTOMATION #1: "NIGHTBOOST ********************************
          
// **************** ROBOSURFER ENHANCEMENT #4: ROBOSENS: ADJUSTS BASAL, ISF, CR BASED ON GLUCOSE AREA UNDER THE CURVE  ****************

//Only use when enable_robosens = true.
 if (enable_robosens) { 
    
// Determine current glucose values for recent 4,8,24 hour periods 
   // Separate glucose and datestring elements into arrays
      glucose.forEach(element => {
       my24hrGlucose.push(element.glucose);
       my24hrGlucoseTime.push(new Date(element.dateString)); // Parse datestring to date object
         });      
       
   // Function to filter glucose data based on time ranges and interpolate any gaps greater than 5 minutes
       const filterByTimeRange = (timeRange, glucose, glucoseTime) => {
       const currentTime = new Date().getTime();
       const timeThreshold = currentTime - (timeRange * 60 * 60 * 1000);

       const filteredData = [];

       for (let i = 0; i < glucose.length; i++) {
           const date = new Date(glucoseTime[i]).getTime();
           if (date >= timeThreshold) {
               filteredData.push({ glucose: glucose[i], datestring: glucoseTime[i] });
           }
       }

       // Interpolate gaps greater than 5 minutes
       for (let i = 1; i < filteredData.length; i++) {
           const currentTime = new Date(filteredData[i].datestring).getTime();
           const prevTime = new Date(filteredData[i - 1].datestring).getTime();
           const timeDiff = (currentTime - prevTime) / (1000 * 60); // Difference in minutes

           if (timeDiff > 5) {
               const numInterpolatedPoints = Math.floor(timeDiff / 5) - 1; // Number of points to interpolate
               const glucoseDiff = (filteredData[i].glucose - filteredData[i - 1].glucose) / (numInterpolatedPoints + 1);

               for (let j = 1; j <= numInterpolatedPoints; j++) {
                   const interpolatedTime = new Date(prevTime + j * 5 * 60 * 1000).toISOString(); // Add 5 minutes
                   const interpolatedGlucose = filteredData[i - 1].glucose + glucoseDiff * j;
                   filteredData.splice(i + (j - 1), 0, { glucose: interpolatedGlucose, dateString: interpolatedTime });
               }
           }
       }

       return filteredData;
   };

   // Separate the data into time ranges (last 4 hours, 8 hours, 24 hours) 
   const last4HoursData = filterByTimeRange(4, my24hrGlucose, my24hrGlucoseTime);
   const last8HoursData = filterByTimeRange(8, my24hrGlucose, my24hrGlucoseTime);
   const last12HoursData = filterByTimeRange(12, my24hrGlucose, my24hrGlucoseTime);
   const last16HoursData = filterByTimeRange(16, my24hrGlucose, my24hrGlucoseTime);
   const last20HoursData = filterByTimeRange(20, my24hrGlucose, my24hrGlucoseTime);  
   const last24HoursData = filterByTimeRange(24, my24hrGlucose, my24hrGlucoseTime);

   // return last4HoursData.map(data => data.glucose); // This is a command to print glucose data from the object if needed

   // Function to calculate the average glucose for a given time period.
   function calculateAverageGlucose(timeperiodData) {
       if (timeperiodData.length === 0) {
           return 0;
       }
   
       const sum = timeperiodData.reduce((acc, current) => acc + current.glucose, 0);
       return sum / timeperiodData.length;
   }

   // Call the calculateAverageGlucose function to Calculate average glucose for each time range
   var averageGlucose_Last4Hours = calculateAverageGlucose(last4HoursData);
   var averageGlucose_Last8Hours = calculateAverageGlucose(last8HoursData);
   var averageGlucose_Last12Hours = calculateAverageGlucose(last12HoursData);
   var averageGlucose_Last16Hours = calculateAverageGlucose(last16HoursData);
   var averageGlucose_Last20Hours = calculateAverageGlucose(last20HoursData);
   var averageGlucose_Last24Hours = calculateAverageGlucose(last24HoursData);

// Calculate percentage over target for each time period
 if (averageGlucose_Last4Hours > target_averageGlucose_Last4Hours) {
       percentageOverTarget_Last4Hours = ((averageGlucose_Last4Hours - target_averageGlucose_Last4Hours) / target_averageGlucose_Last4Hours) * 100;
 }

 if (averageGlucose_Last8Hours > target_averageGlucose_Last8Hours) {   
       percentageOverTarget_Last8Hours = ((averageGlucose_Last8Hours - target_averageGlucose_Last8Hours) / target_averageGlucose_Last8Hours) * 100;
 }
    
 if (averageGlucose_Last12Hours > target_averageGlucose_Last12Hours) {
       percentageOverTarget_Last12Hours = ((averageGlucose_Last12Hours - target_averageGlucose_Last12Hours) / target_averageGlucose_Last12Hours) * 100;
 }

 if (averageGlucose_Last16Hours > target_averageGlucose_Last16Hours) {   
       percentageOverTarget_Last16Hours = ((averageGlucose_Last16Hours - target_averageGlucose_Last16Hours) / target_averageGlucose_Last16Hours) * 100;
 }

 if (averageGlucose_Last20Hours > target_averageGlucose_Last20Hours) {   
       percentageOverTarget_Last20Hours = ((averageGlucose_Last20Hours - target_averageGlucose_Last20Hours) / target_averageGlucose_Last20Hours) * 100;
 }
    
 if (averageGlucose_Last24Hours > target_averageGlucose_Last24Hours) {   
       percentageOverTarget_Last24Hours = ((averageGlucose_Last24Hours - target_averageGlucose_Last24Hours) / target_averageGlucose_Last24Hours) * 100;
 }

// Calculate percentage under range for each time period    
 if (averageGlucose_Last4Hours < user_bottomtargetAverageGlucose) {
       percentageOverTarget_Last4Hours = ((averageGlucose_Last4Hours - user_bottomtargetAverageGlucose) / user_bottomtargetAverageGlucose) * 100;
 }

 if (averageGlucose_Last8Hours < user_bottomtargetAverageGlucose) {   
       percentageOverTarget_Last8Hours = ((averageGlucose_Last8Hours - user_bottomtargetAverageGlucose) / user_bottomtargetAverageGlucose) * 100;
 }

 if (averageGlucose_Last24Hours < user_bottomtargetAverageGlucose) {   
       percentageOverTarget_Last24Hours = ((averageGlucose_Last24Hours - user_bottomtargetAverageGlucose) / user_bottomtargetAverageGlucose) * 100;
 
 }
           
//   ROBOSENS FACTOR: SET THE ROBOSENS FACTOR

       if (percentageOverTarget_Last24Hours > 60) {
             var robosens_maximumPercentProfileAdjustment = 15;
       } else if (percentageOverTarget_Last24Hours > 30)  {
             var robosens_maximumPercentProfileAdjustment = 10;
       } else if (percentageOverTarget_Last24Hours > 5)  {
             var robosens_maximumPercentProfileAdjustment = 5;
       } else if (percentageOverTarget_Last24Hours > 0)( {
             var robosens_maximumPercentProfileAdjustment = 2.5;
         } else if (percentageOverTarget_Last24Hours = 0) {
            var robosens_maximumPercentProfileAdjustment = 0;
        } else if (percentageOverTarget_Last24Hours < 95) {
            var robosens_maximumPercentProfileAdjustment = -10;
         } else {
            var robosens_maximumPercentProfileAdjustment = -5; 
         }
    
      // SUM 1/6 of 24hr for each period over target
      if (percentageOverTarget_Last4Hours > 0) {
            basalfactorFraction_4Hours = .17;
      }

      if (percentageOverTarget_Last8Hours > 0) {
            basalfactorFraction_8Hours = .17;
      }

      if (percentageOverTarget_Last12Hours > 0) {
            basalfactorFraction_12Hours = .17;
      }
      
      if (percentageOverTarget_Last16Hours > 0) {
            basalfactorFraction_16Hours = .17;
      }

      if (percentageOverTarget_Last20Hours > 0) {
            basalfactorFraction_20Hours = .16;
      }

      if (percentageOverTarget_Last24Hours > 0) {
            basalfactorFraction_24Hours = .16;
      }

      totalBasalfactorFraction = basalfactorFraction_4Hours + basalfactorFraction_8Hours + basalfactorFraction_12Hours + basalfactorFraction_16Hours + basalfactorFraction_20Hours + basalfactorFraction_24Hours;
      robosens_basalFactor = round(robosens_maximumpercentbasaladjustment * totalBasalfactorFraction,0);     
      robosens_basalFactor = 1 + (robosens_basalFactor / 100);
   
   if (totalBasalfactorFraction > 0) {
      // Set Robosens Basal Status
            robosens_basal_status = "On:" + (totalBasalfactorFraction * 100) + "%";   

   }
    
 
      // NIGHTPROTECT: IF IT'S NIGHTTIME AND BG IS UNDER NIGHTPROTECT THRESHOLD, REDUCE BASAL BY A SET NIGHTPROTECT FACTOR 
      
            if (enable_nightProtect) {

                  // Current settings: IF BETWEEN 9pm and 3am, and BG under 110, reduce basal by 25%
               
                   if (((now >= nightProtect_start_time && now <= nightProtect_end_time) || (now <= nightProtect_start_time && now <= nightProtect_end_time && nightProtect_start_time > nightProtect_end_time) ||
                      (now >= nightProtect_start_time && now >= nightProtect_end_time && nightProtect_start_time > nightProtect_end_time))
                         && myGlucose < nightProtect_BGThreshold && percentageOverTarget_Last24Hours < 0) {

                         robosens_basalFactor = nightProtect_basalFactor;
                         profile.enableUAM = false;
                         profile.enableSMB_always = false;

                      // Set Robosens Basal Status
                        robosens_basal_status = "On24hrLow_NightProtect"; 
                      
                   }
            }
                 
   // Basal Robosens Adjustment
         new_basal = new_basal * robosens_basalFactor;
         new_basal = round_basal(new_basal);
         profile.current_basal = new_basal;   
       

}

// Robosens ISF and CR Adjustment: Mutiply ISF By Robosens Factor   
             // If carbs have been entered in last 10 minutes, turn off dynamic cr
            // Check if lastCarbTime is less than or equal to 10 minutes from now
             if (now_milliseconds <= lastCarbTimePlus10Mins && lastCarbTime != 0) {
                    enable_dynamic_cr = false;
             }

             // Dynamic CR is adjusted by Robosens only, not by Dynamic ISF or Nightboost
             if (enable_dynamic_cr == true) { 
                    // Adjust by dCR power setting    
                    var dCR_robosens_factor = robosens_sigmoidFactor;
                    if (dCR_robosens_factor > 1) {
                     dCR_robosens_factor = ((dCR_robosens_factor - 1) * (dCR_power/100)) + 1;         
                     new_cr = robosens_isf / dCR_robosens_factor / robosens_csf;
                     new_cr = round(new_cr,1);
                    }     
               } 
             check_csf = robosens_isf / robosens_sigmoidFactor / new_cr;

          new_isf = robosens_isf / robosens_sigmoidFactor / new_dynISF_ratio;
          new_isf = round(new_isf,0);

       
// *************** END ROBOSENS ***************************************       
       
          
// **************** ROBOSURFER ENHANCEMENT #4: SET CONSTANT MINIMUM HOURLY CARB ABSORPTION ****************
// For this function, the user should enter desired MIN CARB ABSORPTION in the min_5m_carbimpact setting instead of a min_5m_carbimpact.
// The function will define the min_5m_carbimpact needed for that MIN CARB ABSORPTION based on current ISF and CR. 
       
//  Initialize function variables
  var min_5m_carbabsorption = 0;
  var min_5m_carbimpact = 0;

// The Constant Carb Absorption Function

  // Reduce hourly carb absorption to 5-minute carb absoorption
     min_5m_carbabsorption = min_hourly_carb_absorption / (60 / 5);

  // Calculate the dynamic min_5m_carbimpact
   min_5m_carbimpact = (min_5m_carbabsorption * new_isf) / new_cr;

   //Set profile to new value
  profile.min_5m_carbimpact = round(min_5m_carbimpact,2);

// *************** END CONSTANT CARB ABSORPTION ***************************************

// **************** ROBOSURFER ENHANCEMENT #5: MEALBOOST: Increase SMBs and Delivery Ratio if 60+COBa and High ROC  ****************
// The function will increase the SMBs if COB = 60 (which generally means >60 COB) and high ROC.   
         
// The Mealboost Function

if (enable_Mealboost) { 

            // Check if the current time is within the specified range, greater COB threshold
          if (((now >= Mealboost_start_time && now <= Mealboost_end_time) || (now <= Mealboost_start_time && now <= Mealboost_end_time && Mealboost_start_time > Mealboost_end_time) ||
             (now >= Mealboost_start_time && now >= Mealboost_end_time && Mealboost_start_time > Mealboost_end_time))
             && myGlucose > 105) 
          {
        
   //Increased Rate of Change (1.6mg/dl per minute)
             if (cob > Mealboost_COB_threshold && glucoseRateOfChange_3Periods > 1.6) {
             
                //105-139 
                if ((myGlucose >= 105 && myGlucose < 139)) {  
                     Mealboost_Status = "Mealboost:OnROC<140"
                     new_maxSMB = maxSMB + Mealboost_SMB_UAM_Minutes_Increase;   
                     new_maxUAM = maxUAM + Mealboost_SMB_UAM_Minutes_Increase;
                }
             
                  // 140+ 
                  if (myGlucose >= 140) {
                     Mealboost_Status = "Mealboost:OnROC140+"
                     new_maxSMB = maxSMB + Mealboost_SMB_UAM_Minutes_Increase;   
                     new_maxUAM = maxUAM + Mealboost_SMB_UAM_Minutes_Increase;
                  }
             }
                
            //High Rate of Change (4mg/dl per minute)
             if (cob > Mealboost_COB_threshold && (glucoseRateOfChange_2Periods > 4 || glucoseRateOfChange_3Periods > 4)) {  

                   //105-139 
                  if ((myGlucose >= 105 && myGlucose < 139)) {      
                        Mealboost_Status = "Mealboost:OnHIGHROC<140"
                        new_maxSMB = maxSMB + Mealboost_SMB_UAM_Minutes_Increase_HIGH;   
                        new_maxUAM = maxUAM + Mealboost_SMB_UAM_Minutes_Increase_HIGH;
                        
                }

                   // 140+ 
                  if (myGlucose >= 140) {   
                     Mealboost_Status = "Mealboost:OnHIGHROC140+"
                     new_maxSMB = maxSMB + Mealboost_SMB_UAM_Minutes_Increase_ACCEL;   
                     new_maxUAM = maxUAM + Mealboost_SMB_UAM_Minutes_Increase_ACCEL;
                     profile.smb_delivery_ratio = Mealboost_SMB_DeliveryRatio_Increase_HIGH;
                  }
                
                }

                  Mealboost_SMB_change = initial_maxSMB - new_maxSMB;    
             
       }
   }

// *************** END MEALBOOST ***************************************      
       
//******************* Set the Profile with the New ISF and CR Settings *****************************
       
      profile.sens = new_isf;    
      profile.carb_ratio = new_cr; 
      profile.maxSMBBasalMinutes = new_maxSMB;   
      profile.maxUAMSMBBasalMinutes = new_maxUAM;   
      profile.maxCOB = new_max_COB;  
       
      var check_carb_absorption =  ((profile.min_5m_carbimpact * profile.carb_ratio) / profile.sens) * (60/5); 
         
    // Sets the autosens ratio to 1 for use by native Sigmoid, prevents any further adjustment to ISF
     autosens.ratio = 1;   

       
// **************** End RoboSurfer Enhancements ****************

return "Robosens Status(" + robosens_power + "%) Basal/ISF " + round(robosens_basalFactor,2) + "(" + robosens_basal_status + ")/" + round(robosens_sigmoidFactor, 2) + "(" + robosens_sens_status +  "). dISF ratio " + round(new_dynISF_ratio, 2) + ". Override" + logOverride + ". ISF was/now " + round(initial_isf, 2) + "/ " + round(profile.sens,2) + " Basal was/now " + old_basal + "/ " + profile.current_basal + ". dCR(" + dCR_power + "% " + enable_dynamic_cr + ") was/now " + initial_cr + "/ " + round(profile.carb_ratio, 2) + " CSF was/now "  + round(initial_csf, 2) + "/ " + round(check_csf, 2)+ ". SMB Deliv. Ratio " + profile.smb_delivery_ratio + " ROBOSENS Trg-" + user_bottomtargetAverageGlucose + "/Av/%Over 4Hr " + target_averageGlucose_Last4Hours + "/" + round(averageGlucose_Last4Hours, 0) + "/" + round(percentageOverTarget_Last4Hours, 0) + "%" + 
" 8Hr" + target_averageGlucose_Last8Hours + "/" + round(averageGlucose_Last8Hours, 0) + "/" + round(percentageOverTarget_Last8Hours, 0) + "%" + 
" 24Hr" + target_averageGlucose_Last24Hours + "/" + round(averageGlucose_Last24Hours, 0) + "/" + round(percentageOverTarget_Last24Hours, 0) + "%" + " RS Adj/AF " + round(robosens_AF_adjustment,2) + "/" + round(robosens_adjustmentFactor,2) + " RS Adj/MAX " + round(robosens_MAX_adjustment,2) + "/" + round(robosens_maximumRatio,2) + " Sensor Safety " + sensor_safety_status + " AUTOMATION1 " + Automation_Status + " " + start_time.toLocaleTimeString([],{hour: '2-digit', minute:'2-digit'}) + " to " + end_time.toLocaleTimeString([],{hour: '2-digit', minute:'2-digit'}) + ". SMB Mins "  + round(profile.maxSMBBasalMinutes, 2) + " UAM Mins "  + round(profile.maxUAMSMBBasalMinutes, 2) + " Max COB "  + round(profile.maxCOB, 2) + ". MinAbsorp((CI) "  + round(check_carb_absorption, 2) + "(" + profile.min_5m_carbimpact + ")" + "Mealboost " + Mealboost_Status + " SMB+" + Mealboost_SMB_change +" TDD " + round(past2hoursAverage, 2) + " 2week TDD " + round(average_total_data, 2);
   }
}
