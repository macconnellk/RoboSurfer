function middleware(iob, currenttemp, glucose, profile, autosens, meal, reservoir, clock, pumphistory, preferences, basal_profile, oref2_variables) {

   function round(value, digits) {
        if (! digits) { digits = 0; }
        var scale = Math.pow(10, digits);
        return Math.round(value * scale) / scale; 
    }   


// RoboSurfer is my own compilation of other individual Middleware capabilites.  RoboSurfer currently includes:
// 1) Sigmoid with Adjustable TDD Response
// 2) Scale SMB Delivery Ratio
// 3) Constant Minimum Carb Absorption
   
//Turn RoboSurfer on or off
  var enable_sigmoidTDD = true;

// DYNAMIC ISF: SIGMOID WITH ENHANCED TDD RESPONSE
//Turn on or off
  var enable_sigmoidTDD = true;

//Only use when enable_sigmoidTDD = true.
// Dynamic ISF and Sigmoid must be on in settings with Min and Max both set to 1 (necessary for past2hraverage to calculate
    if (enable_sigmoidTDD) { 
   
   //  Initialize log variables  
   var log_protectionmechanism = "Off";
   
//  Initialize RoboSurfer function variables
   var myGlucose = glucose[0].glucose;
   var target = profile.min_bg;
   var isf = profile.sens;

//  Initialize Sigmoid function variables
   var minimumRatio = .99;
   var maximumRatio = 1.25;
   var adjustmentFactor = .65;
   var past2hoursAverage = oref2_variables.past2hoursAverage;
   var average_total_data = oref2_variables.average_total_data;
   var weightedAverage = oref2_variables.weightedAverage;

//  Initialize Nightboost function variables
      // NB Thresholds
      var NightBoost_StartTimeHour = 20; // 8pm
      var NightBoost_StartTimeMinute = 0; // 8:00pm
      var NightBoost_CarbThreshold = 0; // COB
      var NightBoost_BGThreshold = 120; // BG over
      var NightBoost_ROCThreshold = 0; // TBD 
      // NB Variables 
      var NightBoost_Status = "Off";
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
      var NightBoosted_csf = 0;
      var NightBoosted_isf = 0;
      var NightBoosted_cr = 0;
      var check_csf = 0;
       
   //  Initialize Constant Carb Absorption variables        
      // Define the minimum amount of carb you wamt iAPS to decay in 1 hour.
      var min_hourly_carb_absorption = 24;

// TDD-Factor Sigmoid Function
     
// DYNISF SIGMOID MODIFICATION #1
// Define a TDD Factor using a Sigmoid curve that approximates the TDD delta effect used in the Chris Wilson DynISF approach.
// This TDD delta effect is not linear across BGs and requires a curve to mimic.
// ORIGINAL SIGMOID APPROACH: const tdd_factor = tdd_averages.weightedAverage / tdd_averages.average_total_data;       
       
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
         

    // Define TDD deviation variable for use in TDD Sigmoid curve based on current percent change between Daily TDD deviation and 2 Week Deviation 
    // This approach will normalize this variable for any TDD value to ensure a standard TDD Factor sigmoid curve for all users
   var tdd_dev = (weightedAverage / average_total_data - 1) * 10;

    // Hard-code TDD Factor Sigmoid inputs
    // These inputs have been modeled to create a TDD Factor that, when used in the Sigmoid DynISF function, closely approximates the TDD delta effect for ULTRA-RAPID used in the Chris Wilson (Logarithmic) DynISF approach. 
    // These inputs are not expected to require user change for ultra-rapid insulin; instead the strength of this factor can be modified below using the tdd_factor_strength_slider.
    // To model the effects of any changes to these values, or adjust for RAPID insulin, see: https://docs.google.com/spreadsheets/d/1k4sGaZYf2t-FbfY8rViqvUnARx_Gu5K_869AH2wgg_A/edit?usp=sharing
    var TDD_sigmoid_adjustment_factor = .41;
    var TDD_sigmoid_max = 3.25;
    var TDD_sigmoid_min = .7;
       
    // Define a TDD Factor Sigmoid curve using same method as the DynISF Sigmoid approach below
    var TDD_sigmoid_interval = TDD_sigmoid_max - TDD_sigmoid_min;
    var TDD_sigmoid_max_minus_one = TDD_sigmoid_max - 1;
    var TDD_sigmoid_fix_offset = (Math.log10(1/TDD_sigmoid_max_minus_one - TDD_sigmoid_min / TDD_sigmoid_max_minus_one) / Math.log10(Math.E));
    var TDD_sigmoid_exponent = tdd_dev * TDD_sigmoid_adjustment_factor + TDD_sigmoid_fix_offset;
       
    // The TDD Factor sigmoid function
    var TDD_factor = TDD_sigmoid_interval / (1 + Math.exp(-TDD_sigmoid_exponent)) + TDD_sigmoid_min;

// The Dynamic ISF Sigmoid Code 

      var ratioInterval = maximumRatio - minimumRatio;
      var max_minus_one = maximumRatio - 1;

   // DYNISF SIGMOID MODIFICATION #2
    // The TDD delta effect in Chris Wilson (Logarithmic) DynISF approach allows ISF to shift when BG is below target BG (unlike the original Sigmoid DynamicISF approach). 
    // The following math applies the new TTD factor to the target BG to this shift.
    // Like the original Sigmoid approach, Profile ISF will be applied at target but only when Daily TDD = 2 Week TDD.  
    // ORIGINAL SIGMOID APPROACH: const bg_dev = (current_bg - profile.min_bg) * 0.0555;

    var deviation = (myGlucose - (target / TDD_factor)) * 0.0555; 
       
     //Makes sigmoid factor(y) = 1 when BG deviation(x) = 0.
     var fix_offset = (Math.log10(1/max_minus_one-minimumRatio/max_minus_one) / Math.log10(Math.E));
       
     //Exponent used in sigmoid formula
     var exponent = deviation * adjustmentFactor * TDD_factor + fix_offset;
    
     // The sigmoid function
     var sigmoidFactor = ratioInterval / (1 + Math.exp(-exponent)) + minimumRatio;

     //Respect min/max ratios
     sigmoidFactor = Math.max(Math.min(maximumRatio, sigmoidFactor), sigmoidFactor, minimumRatio);

      // Sets the new ratio
     autosens.ratio = sigmoidFactor;
      var new_isf = round(isf/autosens.ratio,0)
     profile.sens = new_isf

// ROBOSURFER ENHANCEMENT #2: DYNAMIC SMB DELIVERY RATIO

//  Initialize function variables
  var smb_delivery_ratio = profile.smb_delivery_ratio;
  
// User-Defined function settings
  var smb_delivery_ratio_min = profile.smb_delivery_ratio;
  var smb_delivery_ratio_max = 1;
  var smb_delivery_ratio_bg_range = 65;

// The SMB Delivery Ratio Scaling Function

  // If BG between target and top of BG Range, scale SMB Delivery ratio
  if (myGlucose >= target && myGlucose <= (target+smb_delivery_ratio_bg_range)) {
        smb_delivery_ratio = (myGlucose - target) * ((smb_delivery_ratio_max - smb_delivery_ratio_min) / smb_delivery_ratio_bg_range) + smb_delivery_ratio_min;
   }

  // If BG above user-defined BG range, use SMB ratio max
  if (myGlucose > (target + smb_delivery_ratio_bg_range)) {
        smb_delivery_ratio = smb_delivery_ratio_max;
   }

   // Set profile to new value
     profile.smb_delivery_ratio = round(smb_delivery_ratio,2);


// ROBOSURFER ENHANCEMENT #3:NIGHTBOOST FUNCTION
//Turn on or off
  var enable_nightboost = true;

//Only use when enable_robotune = true
if (enable_nightboost) { 

   // Initialize Function Variables
   // User-defined Settings Increases 
   // Note: To reflect slower digestion and increased impact of carbs, CSF must increase
   // To do so while ISF strenghtens (decreases), CR must strenghten (decrease) more than ISF
      var NightBoost_Autosens_Ratio = 1.3; // user-defined autosens ratio for Nightboost that replaces autosens/dynamic ratio
      var CSF_NightboostStrengthFactor = 1.1; // % change factor used to calculate new CR; 1 = no change to CSF & CR will be adjusted in line with the ISF change. 1.1 is a 10% increase to CSF (carbs would have a ghreater impact on BG) and CR will be strengthened more than ISF to achieve this.
      var SMBUAMMinutes_NightBoostIncrease = 15; // Standard Nightboost SMB/UAM Increase
      var SMBUAMMinutes_ROC_NightBoostIncrease_ROC = 30; // High ROC Nightboost SMB/UAM Increase
      var SMBDeliveryRatio_NightBoostIncrease_ROC  = 1; // High ROC Nightboost SMB Delivery Ratio  
      var COB_Max_NightboostIncrease = 100; // Nightboost COB_Max

      //Add BG Rate of Change Function

      if (now >= NightBoostStart && 
          myGlucose > NightBoost_BGThreshold &&
          COB > NightBoost_CarbThreshold) {
            
            NightBoost_Status = "On";
            NightBoosted_isf = isf_NightBoostStart / NightBoost_Autosens_Ratio;
            NightBoosted_csf = csf_NightboostStart * CSF_NightboostStrengthFactor;
            NightBoosted_cr = NightBoosted_isf /  NightBoosted_csf;
            autosens.ratio = NightBoost_Autosens_Ratio;
            profile.sens = NightBoosted_isf;
            profile.carb_ratio = NightBoosted_cr;  
            check_csf = profile.sens / profile.carb_ratio;
            profile.maxSMBBasalMinutes = maxSMB + SMBUAMMinutes_NightBoostIncrease;   
            profile.maxUAMSMBBasalMinutes = maxUAM + SMBUAMMinutes_NightBoostIncrease;   
            profile.maxCOB = COB_Max_NightboostIncrease; 
            min_hourly_carb_absorption = 11; // Option to change carb absorption e.g. slower after bedtime after late meals. Assumes use of constant_carb_absorption function
            
          //   if (ROC >= NightBoostROCThreshold) {
          //      profile.sens = 
          //      profile.maxSMBBasalMinutes = maxSMB + NightBoostSMBUAMMinutesROC
          //     profile.maxUAMSMBBasalMinutes = maxUAM + + NightBoostSMBUAMMinutesROC 
          //    }
       
        }       
      } 
       
// ROBOSURFER ENHANCEMENT #4: SET CONSTANT MINIMUM HOURLY CARB ABSORPTION
// For this function, the user should enter desired MIN CARB ABSORPTION in the min_5m_carbimpact setting instead of a min_5m_carbimpact.
// The function will define the min_5m_carbimpact needed for that MIN CARB ABSORPTION based on current ISF and CR. 
       
//  Initialize function variables
  var carb_ratio = profile.carb_ratio;
   var min_5m_carbabsorption = 0;
  var min_5m_carbimpact = 0;

// The Constant Carb Absorption Function

  // Reduce hourly carb absorption to 5-minute carb absoorption
     min_5m_carbabsorption = min_hourly_carb_absorption / (60 / 5);

  // Calculate the dynamic min_5m_carbimpact
   min_5m_carbimpact = (min_5m_carbabsorption * new_isf) / carb_ratio;

   //Set profile to new value
  profile.min_5m_carbimpact = round(min_5m_carbimpact,2);

// End RoboSurfer Enhancements

//if (NightBoost_Status = "On") {       
// return "Nightboost: " + NightBoost_Status + "Autosens ratio: " + round(autosens.ratio, 2) + ". ISF set from: " + round(isf, 2) + " to " + round(profile.sens,2) + ". SMB Delivery Ratio: " + profile.smb_delivery_ratio + " Min Absorption: " + round(min_hourly_carb_absorption, 2) + " Nightboost Start: " + NightBoostStart.toLocaleTimeString([],{hour: '2-digit', minute:'2-digit'}) + " Nightboost CR: " + round(profile.carb_ratio, 2) + " CSF Check: Profile CSF: "  + round(csf_NightboostStart, 2) + " Nightboost CSF: " + round(check_csf, 2) + " SMB Minutes: "  + round(profile.maxSMBBasalMinutes, 2) + " UAM Minutes: "  + round(profile.maxUAMSMBBasalMinutes, 2) + " Max COB: "  + round(profile.maxCOB, 2);
//} else {
   //return "Autosens ratio: " + round(autosens.ratio, 2) + ". Sens Protect is " + log_protectionmechanism + ". ISF set from: " + round(isf, 2) + " to " + round(profile.sens,2) + " TDD:" + round(past2hoursAverage, 2) + " Two-week TDD:" + round(average_total_data, 2) + " Weighted Average:" + round(weightedAverage, 2) + ". SMB Delivery Ratio: " + profile.smb_delivery_ratio + " Min Absorption: " + round(min_hourly_carb_absorption, 2) + ". Nightboost: " + NightBoost_Status;
   // }
       
   }
}
