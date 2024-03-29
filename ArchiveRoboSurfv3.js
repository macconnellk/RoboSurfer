function middleware(iob, currenttemp, glucose, profile, autosens, meal, reservoir, clock, pumphistory, preferences, basal_profile, oref2_variables) {

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
// 2) Scale SMB Delivery Ratio
// 3) Constant Minimum Carb Absorption
// 4) Settings automations
//    a) Nightboost

//RoboSurfer uses Sigmoid Dynamic ISF.  Settings are made here within the code.  
//Within iAPS, Dynamic and Sigmoid must be toggled on, AF set to .1 and AS Min/Max set to .999/1.001. This runs the new ISF through the native Sigmoid but with no effect.     
   
//Turn RoboSurfer and functions on or off
  var enable_RoboSurfer = true;
  var enable_robosens = true;  
  var enable_new_sigmoidTDDFactor = true;
  var enable_Automation_1 = true; 
  var enable_smb_delivery_ratio_scaling = true;

         // Sensor Safety: if data gaps or high BG delta, disable SMBs, UAMs, and smb_delivery_ratio_scaling. Also calculate glucose rate of change per minute
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
         var glucoseRateOfChange_3Periods = glucoseDiff_3Periods / timeDiff_3Periods;  //normally 10 minutes

         if (timeDiff_Now >= 12 || timeDiff_2Periods >= 17 || glucoseDiff_Now >= maxDeltaTick || glucoseDiff_PriorPeriod >= maxDeltaTick ) {      
    
                      sensor_safety_status = "On " + timeDiff_Now + " " + timeDiff_2Periods + " " + glucoseDiff_Now + " " + glucoseDiff_PriorPeriod;
                      profile.enableUAM = false;
                      profile.enableSMB_always = false;
                      enable_smb_delivery_ratio_scaling = false;
                      enable_Automation_1 = false;
       
             }
   
   //Only use Middleware when enable_RoboSurfer = true.
    if (enable_RoboSurfer) {

   //  Initialize log variables  
   var log_protectionmechanism = "Off";
   
//  Initialize general RoboSurfer function variables
   var myGlucose = glucose[0].glucose;
   var target = profile.min_bg;
   var isf = profile.sens;
   var cr = profile.carb_ratio; 
   var csf = isf / cr;    
   var cob = meal.mealCOB;
   var iob = iob[0].iob    
   var max_COB = profile.maxCOB;   
   var maxSMB = profile.maxSMBBasalMinutes;
   var maxUAM = profile.maxUAMSMBBasalMinutes;  
   var smb_delivery_ratio = profile.smb_delivery_ratio;
   const now = new Date();
   var new_autosens_ratio = 1;
   var new_isf = isf;
   var new_cr = cr;    
   var new_maxSMB = maxSMB;   
   var new_maxUAM = maxUAM;   
   var new_max_COB = max_COB;    
   var check_csf = 0;    

//  Initialize Sigmoid Enhanced with TDD Response function variables
   var minimumRatio = .99;
   var maximumRatio = 1.25;
   var adjustmentFactor = .75;
   var past2hoursAverage = oref2_variables.past2hoursAverage;
   var average_total_data = oref2_variables.average_total_data;
   var weightedAverage = oref2_variables.weightedAverage;
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
      end_time.setHours(0, 0, 0); // Assuming the end time is 12:00 AM
       
      var Automation_1_BGThreshold_1 = 120; // BG over 
      var Automation_1_BGThreshold_2 = 140; // BG over
      var Automation_1_BGThreshold_3 = 160; // BG over 
      var Automation_1_BGThreshold_4 = 180; // BG over
      var Automation_1_BGThreshold_5 = 200; // BG over 
      var Automation_1_BGThreshold_6 = 220; // BG over
       
      var Automation_1_CarbThreshold = 0; // COB
      var Automation_1_BG_Accel_Threshold = 0; // TBD
       
         // Automation_1 User-Defined Variables 
         var Automation_1_name = "Nightboost"; // Give the Automation a Name for use in return string

         //120-139 (109%-125%)
         //Automation 1 Sigmoid - Threshold 1
         var Automation_1_minimumRatio_1 = .5;
         var Automation_1_maximumRatio_1 = 1.45;
         var Automation_1_adjustmentFactor_1 = .75;

         // 140-159 (142% - 164%)
         //Automation 1 Sigmoid - Threshold 2
         var Automation_1_minimumRatio_2 = .5;
         var Automation_1_maximumRatio_2 = 1.9;
         var Automation_1_adjustmentFactor_2 = .75;

         //160-179 (190%-203%)
         //Automation 1 Sigmoid - Threshold 3 
         var Automation_1_minimumRatio_3 = .5;
         var Automation_1_maximumRatio_3 = 2.1;
         var Automation_1_adjustmentFactor_3 = 1;

         //180-199 (238% - 246%)
         //Automation 1 Sigmoid - Threshold 4 
         var Automation_1_minimumRatio_4 = .5;
         var Automation_1_maximumRatio_4 = 2.5;
         var Automation_1_adjustmentFactor_4 = 1;

        //199-219 (274% - 278%)
        //Automation 1 Sigmoid - Threshold 5 
         var Automation_1_minimumRatio_5 = .5;
         var Automation_1_maximumRatio_5 = 2.8;
         var Automation_1_adjustmentFactor_5 = 1;

         //220+ (345% - 350%)
         //Automation 1 Sigmoid - Threshold 6 
         var Automation_1_minimumRatio_6 = .5;
         var Automation_1_maximumRatio_6 = 3.5;
         var Automation_1_adjustmentFactor_6 = 1;
       
          //Automation 1 Dynamic CR 
         var enable_Automation_1_dynamic_cr = true; // this variation of dynamic CR uses CSF to adjust CR in tandem wuth ISF. A CSF_StrengthFactor of 1 maintains the existing CSF and CR will be adjusted with ISF to maintain existing CSF.
            var Automation_1_CSF_StrengthFactor = 1.1; // % change factor used to calculate new CR; 1 = no change to CSF & CR will be adjusted in line with the ISF change. 1.1 is a 10% increase to CSF (i.e carbs would have a greater impact on BG) and CR will be strengthened more than ISF to achieve this.
             // Example: To reflect an increased impact of carbs at night (and slower absorption/digestion) during this time period, CSF must increase, CR would be adjusted more than ISF as a result. 
       
       //Automation 1 Other Settings
         var Automation_1_SMB_UAM_Minutes_Increase = 15; // Standard Automation #1 SMB/UAM Increase
         var Automation_1_SMB_UAM_Minutes_Increase_HIGH = 30; // High BG Automation #1 SMB/UAM Increase
         var Automation_1_SMB_UAM_Minutes_Increase_ACCEL = 60; // High BG Rate of Change Automation #1 SMB/UAM Increase 
         var Automation_1_SMB_DeliveryRatio_Increase_ACCEL  = 1; // High BG Rate of Change SMB Delivery Ratio  
         var Automation_1_COB_Max = 100; // Automation #1 COB_Max
         var Automation_1_min_hourly_carb_absorption = 11; // Automation #1 min_hourly_carb_absorption. Option to change carb absorption e.g. slower after bedtime after late meals. Assumes use of constant_carb_absorption function

      // Automation_1 Initialized Function Variables    
      var Automation_Status = "Off";
      var Automation_1_isf_output = isf;
      var Automation_1_cr_output = cr;
      var Automation_1_csf_output = csf;

// Initialize SMB Delivery Ratio Scaling variables
  var smb_delivery_ratio_min = profile.smb_delivery_ratio;
  var smb_delivery_ratio_scale_start_bg = 160;     
  var smb_delivery_ratio_max = .75;
  var smb_delivery_ratio_bg_range = 60;       
       
//  Initialize Constant Carb Absorption variables        
      // Define the minimum amount of carb you wamt iAPS to decay in 1 hour.
      var min_hourly_carb_absorption = 34;

//  Initialize ROBOSENS variables
       // Initilize function variables
         var my24hrGlucose = []; // create array
         var my24hrGlucoseTime = []; // create array
         var old_basal = profile.current_basal;
         var new_basal = profile.current_basal;     

      // User-defined AUC targets for each time period in mg / dl / h (average glucose)
      // Define target average glucose levels for different time periods
             // User-defined targets for 4, 8, 24 lookbacks
             // 4 hour average targets
               const user_targetGlucoseLast4Hours = {0: 118, 1: 115, 2: 108, 3: 103, 4: 100, 5: 105, 6: 106, 7: 106, 8: 106, 9: 109, 10: 113, 11: 115, 12: 115, 13: 115, 14: 115, 15: 118, 16: 120, 17: 120, 18: 120, 19: 123, 20: 125, 21: 120, 22: 123, 23: 120};

             // 8 hour avergae targets
               const user_targetGlucoseLast8Hours = {0: 121, 1: 118, 2: 115, 3: 111, 4: 109, 5: 110, 6: 107, 7: 104, 8: 103, 9: 107, 10: 109, 11: 111, 12: 111, 13: 112, 14: 114, 15: 116, 16: 118, 17: 118, 18: 118, 19: 120, 20: 123, 21: 120, 22: 121, 23: 121};

             // 12 hour average target
               const user_targetAverageGlucoseLast24Hours = 114;

      // Initialize the target variables based on current hour
             // Get the current hour
               const currentHour = new Date().getHours();

            // Select the target thresholds
               var target_averageGlucose_Last4Hours = user_targetGlucoseLast4Hours[currentHour];
               var target_averageGlucose_Last8Hours = user_targetGlucoseLast8Hours[currentHour];
               var target_averageGlucose_Last24Hours = user_targetAverageGlucoseLast24Hours;

      //  Initialize basal sigmoid function variables
               var robosens_minimumRatio = .7;
               var robosens_maximumRatio = 1.2;
               var robosens_adjustmentFactor = .5;
               var robosens_sigmoidFactor = 1;
               var robosens_sens_status = "On4hr";
               var robosens_AF_adjustment = 0;
               var robosens_MAX_adjustment = 0;
               var dynamic_deviation_high = 160;
               var dynamic_deviation_veryhigh = 220;    
          
// **************** ROBOSURFER ENHANCEMENT #1: ROBOSENS ****************

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
   var averageGlucose_Last24Hours = calculateAverageGlucose(last24HoursData);

// Calculate percentage over target for each time period
var percentageOverTarget_Last4Hours = ((averageGlucose_Last4Hours - target_averageGlucose_Last4Hours) / target_averageGlucose_Last4Hours) * 100;
var percentageOverTarget_Last8Hours = ((averageGlucose_Last8Hours - target_averageGlucose_Last8Hours) / target_averageGlucose_Last8Hours) * 100;
var percentageOverTarget_Last24Hours = ((averageGlucose_Last24Hours - target_averageGlucose_Last24Hours) / target_averageGlucose_Last24Hours) * 100;

//Create the ROBOSENS RATIO Sigmoid Factor
// DYNAMIC ROBOSENS SIGMOID Function

// RoboSens Sensitivity Protection Mechanism: If 4hr average glucose > 4hr target but current BG is under 4hr target, no adjustment to basal.
//   if (averageGlucose_Last4Hours < target_averageGlucose_Last4Hours && myGlucose <= target_averageGlucose_Last4Hours ) {
//      robosens_sigmoidFactor = 1;
//      robosens_sens_status = "Protect";
//   } else {
       
      //  Increase the basal sigmoid AF if the 8hr Percent Over Target is high
      // Increase by .1 per each additional 10%
      if (percentageOverTarget_Last8Hours > 0 ) {
         robosens_AF_adjustment = percentageOverTarget_Last8Hours / 100;   
         robosens_adjustmentFactor = robosens_adjustmentFactor + robosens_AF_adjustment;
         }

      //  Increase the basal sigmoid robosens max if the 24hr Percent Over Target is high
      // Increase by .1 per each additional 10%
      if (percentageOverTarget_Last24Hours > 0) {
         robosens_MAX_adjustment = percentageOverTarget_Last24Hours / 100;   
         robosens_maximumRatio = robosens_maximumRatio + robosens_MAX_adjustment;
         }

      var robosens_ratioInterval = robosens_maximumRatio - robosens_minimumRatio;
      var robosens_max_minus_one = robosens_maximumRatio - 1;
      
       // Dynamic deviation
       // Sigmoid is based on 4 hour average bg. If current BG is over 160, use the max of 4,8,24 hour.  If current BG is over 220, use max of now,4,8,24.  
       // This is to tilt towards ongoing periods of resistance (8 or 24 hour) if current BG goes high. 
             var deviation_bg = averageGlucose_Last4Hours;
                    if (myGlucose > dynamic_deviation_high) {
                          deviation_bg = Math.max(averageGlucose_Last4Hours, averageGlucose_Last8Hours, averageGlucose_Last24Hours);
                     }

                    if (myGlucose > dynamic_deviation_veryhigh) {
                           deviation_bg = Math.max(myGlucose,averageGlucose_Last4Hours, averageGlucose_Last8Hours, averageGlucose_Last24Hours);
                     }

                        // Set Status
                           if (deviation_bg == averageGlucose_Last8Hours) {
                                  robosens_sens_status = "On8hr";
                           } 
                            if (deviation_bg == averageGlucose_Last24Hours) {
                                  robosens_sens_status = "On24hr";   
                           } 
                            if (deviation_bg == myGlucose) {
                                  robosens_sens_status = "OnCurrentBG";
                           }      
         
         var robosens_deviation = (deviation_bg - target_averageGlucose_Last4Hours) * 0.0555;
    
     //Makes sigmoid factor(y) = 1 when BG deviation(x) = 0.
     var robosens_fix_offset = (Math.log10(1/robosens_max_minus_one - robosens_minimumRatio / robosens_max_minus_one) / Math.log10(Math.E));
       
     //Exponent used in sigmoid formula
     var robosens_exponent = robosens_deviation * robosens_adjustmentFactor + robosens_fix_offset;
    
     // The sigmoid function
     robosens_sigmoidFactor = robosens_ratioInterval / (1 + Math.exp(-robosens_exponent)) + robosens_minimumRatio;

     //Respect min/max ratios
     robosens_sigmoidFactor = Math.max(Math.min(robosens_maximumRatio, robosens_sigmoidFactor), robosens_sigmoidFactor, robosens_minimumRatio);
   

 // Basal Adjustment
   new_basal = profile.current_basal * robosens_sigmoidFactor;
   new_basal = round_basal(new_basal);
   profile.current_basal = new_basal;    

                               
// Return the percentage over target results
//return "ROBOSENS: Trgt/Avg/%Over: 4 Hours: " + target_averageGlucose_Last4Hours + "/" + round(averageGlucose_Last4Hours, 0) + "/" + round(percentageOverTarget_Last4Hours, 0) + "%" + 
//" 8 Hours:" + target_averageGlucose_Last8Hours + "/" + round(averageGlucose_Last8Hours, 0) + "/" + round(percentageOverTarget_Last8Hours, 0) + "%" + 
//" 24 Hours:" + target_averageGlucose_Last24Hours + "/" + round(averageGlucose_Last24Hours, 0) + "/" + round(percentageOverTarget_Last24Hours, 0) + "%" + " RoboSens Ratio: " + round(robosens_sigmoidFactor, 2) + "Profile Basal: " + old_basal + " RoboSens Basal: " + profile.current_basal + " RoboSens Protection: " + robosens_sens_status + " RoboSens AF Adj/Factor: " + robosens_AF_adjustment + "/" + robosens_adjustmentFactor + " RoboSens Max Adj/Max: " + robosens_MAX_adjustment + "/" + robosens_maximumRatio;
     

}
       
       
//  **************** ROBOSURFER ENHANCEMENT #2: Sigmoid Function with TDD-Factor Enhancement  ****************
     
function sigmoidFunction(enable_new_sigmoidTDDFactor, adjustmentFactor, 
minimumRatio, maximumRatio, weightedAverage, average_total_data, past2hoursAverage) {        


   // DYNISF SIGMOID MODIFICATION #1
   // Use the robosens_sigmoidFactor as the TDD factor
   // ORIGINAL SIGMOID APPROACH: const tdd_factor = tdd_averages.weightedAverage / tdd_averages.average_total_data;
   
 if (enable_new_sigmoidTDDFactor) {
      var TDD_factor = robosens_sigmoidFactor;
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

    new_autosens_ratio = sigmoidFunction(enable_new_sigmoidTDDFactor, adjustmentFactor, minimumRatio, maximumRatio, weightedAverage, average_total_data, past2hoursAverage);  
     
       
// **************** ROBOSURFER ENHANCEMENT #3: DYNAMIC SMB DELIVERY RATIO ****************
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

// **************** ROBOSURFER ENHANCEMENT #3: AUTOMATION #1: "NIGHTBOOST ****************
//Only use when enable_Automation_1 = true
if (enable_Automation_1) { 

            // Check if the current time is within the specified range, greater than BG threshold and COB threshold
          if (((now >= start_time && now <= end_time) || (now <= start_time && now <= end_time && start_time > end_time) ||
             (now >= start_time && now >= end_time && start_time > end_time))
             && myGlucose > Automation_1_BGThreshold_1 && cob >= Automation_1_CarbThreshold) 
          {

            new_max_COB = Automation_1_COB_Max; 
            min_hourly_carb_absorption = Automation_1_min_hourly_carb_absorption; //

               // Determine Nightboost status and response
               //Normal Rate of Change
             
                //120-139 (109%-125%)
                if ((myGlucose >= Automation_1_BGThreshold_1 && myGlucose < Automation_1_BGThreshold_2)) {  
                      // Set Nightboost Threshold 1 Factors    
                     Automation_Status = Automation_1_name + " On1";   
                     var NightBoost_Sigmoid_Min = Automation_1_minimumRatio_1;
                     var NightBoost_Sigmoid_Max = Automation_1_maximumRatio_1;
                     var NightBoost_Sigmoid_AF = Automation_1_adjustmentFactor_1;
                     new_maxSMB = maxSMB + Automation_1_SMB_UAM_Minutes_Increase;   
                     new_maxUAM = maxUAM + Automation_1_SMB_UAM_Minutes_Increase;   
                }
             
                  // 140-159 (142% - 164%)
                  if (myGlucose >= Automation_1_BGThreshold_2 && myGlucose < Automation_1_BGThreshold_3) {
                     // Set Nightboost Threshold 2 Factors    
                     Automation_Status = Automation_1_name + " On2";
                     var NightBoost_Sigmoid_Min = Automation_1_minimumRatio_2;
                     var NightBoost_Sigmoid_Max = Automation_1_maximumRatio_2;
                     var NightBoost_Sigmoid_AF = Automation_1_adjustmentFactor_2;
                     new_maxSMB = maxSMB + Automation_1_SMB_UAM_Minutes_Increase;   
                     new_maxUAM = maxUAM + Automation_1_SMB_UAM_Minutes_Increase;
                  }

                   //160-179 (190%-203%)
                   if (myGlucose >= Automation_1_BGThreshold_3 && myGlucose < Automation_1_BGThreshold_4) {
                        // Set Nightboost Threshold 3 Factors    
                        Automation_Status = Automation_1_name + " On3";
                        var NightBoost_Sigmoid_Min = Automation_1_minimumRatio_3;
                        var NightBoost_Sigmoid_Max = Automation_1_maximumRatio_3;
                        var NightBoost_Sigmoid_AF = Automation_1_adjustmentFactor_3;
                        new_maxSMB = maxSMB + Automation_1_SMB_UAM_Minutes_Increase_HIGH;   
                        new_maxUAM = maxUAM + Automation_1_SMB_UAM_Minutes_Increase_HIGH; 
                   }

                  //180-199 (238% - 246%)
                   if (myGlucose >= Automation_1_BGThreshold_4 && myGlucose < Automation_1_BGThreshold_5) {
                        // Set Nightboost Threshold 4 Factors    
                        Automation_Status = Automation_1_name + " On4";
                        var NightBoost_Sigmoid_Min = Automation_1_minimumRatio_4;
                        var NightBoost_Sigmoid_Max = Automation_1_maximumRatio_4;
                        var NightBoost_Sigmoid_AF = Automation_1_adjustmentFactor_4;
                        new_maxSMB = maxSMB + Automation_1_SMB_UAM_Minutes_Increase_HIGH;   
                        new_maxUAM = maxUAM + Automation_1_SMB_UAM_Minutes_Increase_HIGH; 
                   }

                   //199-219 (274% - 278%)
                   if (myGlucose >= Automation_1_BGThreshold_5 && myGlucose < Automation_1_BGThreshold_6) {
                     // Set Nightboost Threshold 5 Factors    
                     Automation_Status = Automation_1_name + " On5";
                     var NightBoost_Sigmoid_Min = Automation_1_minimumRatio_5;
                     var NightBoost_Sigmoid_Max = Automation_1_maximumRatio_5;
                     var NightBoost_Sigmoid_AF = Automation_1_adjustmentFactor_5;
                     new_maxSMB = maxSMB + Automation_1_SMB_UAM_Minutes_Increase_HIGH;   
                     new_maxUAM = maxUAM + Automation_1_SMB_UAM_Minutes_Increase_HIGH; 
                   }

                // //220+ (345% - 350%)
                   if (myGlucose >= Automation_1_BGThreshold_6) {
                     // Set Nightboost Threshold 6 Factors    
                     Automation_Status = Automation_1_name + " On6";
                     var NightBoost_Sigmoid_Min = Automation_1_minimumRatio_6;
                     var NightBoost_Sigmoid_Max = Automation_1_maximumRatio_6;
                     var NightBoost_Sigmoid_AF = Automation_1_adjustmentFactor_6;
                     new_maxSMB = maxSMB + Automation_1_SMB_UAM_Minutes_Increase_HIGH;   
                     new_maxUAM = maxUAM + Automation_1_SMB_UAM_Minutes_Increase_HIGH; 
                   }
             
            //High Rate of Change (4mg/dl per minute)
             if (glucoseRateOfChange_Now > 4 || glucoseRateOfChange_2Periods > 4 || glucoseRateOfChange_3Periods > 4) {  

                   // 120 -140 (107% - 135%)
                  if ((myGlucose >= Automation_1_BGThreshold_1ROC && myGlucose < Automation_1_BGThreshold_1)) {  
                        // Set Nightboost Threshold 2 Factors with Acceleration    
                        Automation_Status = Automation_1_name + " On ROC2";
                        var NightBoost_Sigmoid_Min = Automation_1_minimumRatio_2;
                        var NightBoost_Sigmoid_Max = Automation_1_maximumRatio_2;
                        var NightBoost_Sigmoid_AF = Automation_1_adjustmentFactor_2;
                        new_maxSMB = maxSMB + Automation_1_SMB_UAM_Minutes_Increase_ACCEL;   
                        new_maxUAM = maxUAM + Automation_1_SMB_UAM_Minutes_Increase_ACCEL;
                        profile.smb_delivery_ratio = Automation_1_SMB_DeliveryRatio_Increase_ACCEL;
                }

                   // 140 -160 (153% - 185%)
                  if (myGlucose >= Automation_1_BGThreshold_1 && myGlucose < Automation_1_BGThreshold_2) {
                     // Set Nightboost Threshold 3 Factors with Acceleration    
                     Automation_Status = Automation_1_name + " On ROC3";
                     var NightBoost_Sigmoid_Min = Automation_1_minimumRatio_3;
                     var NightBoost_Sigmoid_Max = Automation_1_maximumRatio_3;
                     var NightBoost_Sigmoid_AF = Automation_1_adjustmentFactor_3;
                     new_maxSMB = maxSMB + Automation_1_SMB_UAM_Minutes_Increase_ACCEL;   
                     new_maxUAM = maxUAM + Automation_1_SMB_UAM_Minutes_Increase_ACCEL;
                     profile.smb_delivery_ratio = Automation_1_SMB_DeliveryRatio_Increase_ACCEL;
                  }

                   //160+ (262% - 350%)
                if (myGlucose >= Automation_1_BGThreshold_2) {
                     // Set Nightboost Threshold 4 Factors with Acceleration    
                     Automation_Status = Automation_1_name + " On ROC6";
                     var NightBoost_Sigmoid_Min = Automation_1_minimumRatio_6;
                     var NightBoost_Sigmoid_Max = Automation_1_maximumRatio_6;
                     var NightBoost_Sigmoid_AF = Automation_1_adjustmentFactor_6;
                     new_maxSMB = maxSMB + Automation_1_SMB_UAM_Minutes_Increase_ACCEL;   
                     new_maxUAM = maxUAM + Automation_1_SMB_UAM_Minutes_Increase_ACCEL;
                     profile.smb_delivery_ratio = Automation_1_SMB_DeliveryRatio_Increase_ACCEL; 
                  }
                
                }

             
            // Run Sigmoid Function  
            new_autosens_ratio = sigmoidFunction(enable_new_sigmoidTDDFactor, NightBoost_Sigmoid_AF, NightBoost_Sigmoid_Min, NightBoost_Sigmoid_Max, weightedAverage, average_total_data, past2hoursAverage);  // New Sigmoid autosens ratio for Automation #1 that replaces initial autosens ratio
            Automation_1_isf_output = round(isf / new_autosens_ratio,0)
            
            if (enable_Automation_1_dynamic_cr == true) { 
            Automation_1_csf_output = csf * Automation_1_CSF_StrengthFactor;
            Automation_1_cr_output =  Automation_1_isf_output /  Automation_1_csf_output;
            new_cr = Automation_1_cr_output;  
            }
               
       
        }       
      } 

             
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

//******************* Set the ISF New Settings *****************************     
    
   // Sets the new ISF 
     new_isf = round(isf / new_autosens_ratio,0);
     profile.sens = new_isf; 

   // Sets the new CR    
      profile.carb_ratio = new_cr; 
      check_csf = profile.sens / profile.carb_ratio; 

      profile.maxSMBBasalMinutes = new_maxSMB;   
      profile.maxUAMSMBBasalMinutes = new_maxUAM;   
      profile.maxCOB = new_max_COB;    

    // Sets the autosens ratio to 1 for use by native Sigmoid, prevents any further adjustment to ISF
     autosens.ratio = 1;   


       
// **************** End RoboSurfer Enhancements ****************

return "ISF ratio: " + round(new_autosens_ratio, 2) + ". Basal Ratio: " + round(robosens_sigmoidFactor, 2) + ". ISF was: " + round(isf, 2) + " now " + round(profile.sens,2) + " Basal was: " + old_basal + " now " + profile.current_basal +". SMB Deliv. Ratio: " + profile.smb_delivery_ratio + " ROBOSENS: Status: " + robosens_sens_status + ". Trg/Av/%Over: 4Hr: " + target_averageGlucose_Last4Hours + "/" + round(averageGlucose_Last4Hours, 0) + "/" + round(percentageOverTarget_Last4Hours, 0) + "%" + 
" 8Hr:" + target_averageGlucose_Last8Hours + "/" + round(averageGlucose_Last8Hours, 0) + "/" + round(percentageOverTarget_Last8Hours, 0) + "%" + 
" 24Hr:" + target_averageGlucose_Last24Hours + "/" + round(averageGlucose_Last24Hours, 0) + "/" + round(percentageOverTarget_Last24Hours, 0) + "%" + " RS Adj/AF: " + round(robosens_AF_adjustment,2) + "/" + round(robosens_adjustmentFactor,2) + " RS Adj/MAX: " + round(robosens_MAX_adjustment,2) + "/" + round(robosens_maximumRatio,2) + " AUTOMATION1: " + Automation_Status + ": " + start_time.toLocaleTimeString([],{hour: '2-digit', minute:'2-digit'}) + " to " + end_time.toLocaleTimeString([],{hour: '2-digit', minute:'2-digit'}) + ". New CR: "  + round(profile.carb_ratio, 2) + " CSF was "  + round(csf, 2) + " now " + round(check_csf, 2) + ". SMB Mins: "  + round(profile.maxSMBBasalMinutes, 2) + " UAM Mins: "  + round(profile.maxUAMSMBBasalMinutes, 2) + " Max COB: "  + round(profile.maxCOB, 2) + ". MinAbsorp((CI): "  + round(min_hourly_carb_absorption, 2) + "(" + profile.min_5m_carbimpact + ")"  + "Sensor Safety: " + sensor_safety_status + " " + round(glucoseDiff_Now,2) + " " + round(timeDiff_Now,2) + " " + round(glucoseRateOfChange_Now,1) + " TDD Protect: " + log_protectionmechanism + " TDD:" + round(past2hoursAverage, 2) + " 2week TDD:" + round(average_total_data, 2) + " Wtd Avg:" + round(weightedAverage, 2);
   }
}
