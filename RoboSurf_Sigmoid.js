function middleware(iob, currenttemp, glucose, profile, autosens, meal, reservoir, clock, pumphistory, preferences, basal_profile, oref2_variables) {

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
  var enable_Automation_1 = true; 
  var enable_new_sigmoidTDDFactor = true; 

//Only use Middleware when enable_RoboSurfer = true.
    if (enable_RoboSurfer) {

   //  Initialize log variables  
   var log_protectionmechanism = "Off";
   
//  Initialize general RoboSurfer function variables
   var myGlucose = glucose[0].glucose;
   var target = profile.min_bg;
   var isf = profile.sens;
   var cob = meal.mealCOB; 
   const now = new Date();
   var new_isf = 0;
   var new_autosens_ratio = 0;   

//  Initialize Sigmoid Enhanced with TDD Response function variables
   var minimumRatio = .99;
   var maximumRatio = 1.25;
   var adjustmentFactor = .65;
   var past2hoursAverage = oref2_variables.past2hoursAverage;
   var average_total_data = oref2_variables.average_total_data;
   var weightedAverage = oref2_variables.weightedAverage;

//  Initialize Automation #1 function variables
      // Automation #1 Thresholds
      var Automation_1_StartTimeHour = 20; // 8pm
      var Automation_1_StartTimeMinute = 0; // 8:00pm
      var Automation_1_BGThreshold = 120; // BG over
      var Automation_1_CarbThreshold = 0; // COB
      var Automation_1_BG_Accel_Threshold = 0; // TBD
       
      // Automation_1 Variables 
      var Automation_Status = "Off";
      const Automation_1_Start_Time = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Automation_1_StartTimeHour, Automation_1_StartTimeMinute, 0);
      var Automation_1_isf_Start = profile.sens;
      var Automation_1_cr_Start = profile.carb_ratio;
      var Automation_1_csf_Start = Automation_1_isf_Start / Automation_1_cr_Start; 
      var Automation_1_max_COB = profile.maxCOB;   
      var Automation_1_maxSMB = profile.maxSMBBasalMinutes;
      var Automation_1_maxUAM = profile.maxUAMSMBBasalMinutes;  
      var Automation_1_SMBDeliveryRatio_Start = profile.smb_delivery_ratio;     
      var Automation_1_isf_ouput = 0;
      var Automation_1_cr_output = 0;
      var Automation_1_csf_output = 0;
      var Automation_1_check_csf = 0;
       
//  Initialize Constant Carb Absorption variables        
      // Define the minimum amount of carb you wamt iAPS to decay in 1 hour.
      var min_hourly_carb_absorption = 24;

//  **************** ROBOSURFER ENHANCEMENT #1: Sigmoid Function with TDD-Factor Enhancement  ****************
     
function sigmoidFunction(adjustmentFactor, 
minimumRatio, maximumRatio, weightedAverage, average_total_data, past2hoursAverage) {        

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
   

   // DYNISF SIGMOID MODIFICATION #1
   // Define a TDD Factor using a Sigmoid curve that approximates the TDD delta effect used in the Chris Wilson DynISF approach.
   // This TDD delta effect is not linear across BGs and requires a curve to mimic.
   // ORIGINAL SIGMOID APPROACH: const tdd_factor = tdd_averages.weightedAverage / tdd_averages.average_total_data;
   
 if (enable_new_sigmoidTDDFactor = true) {
    
    // Define TDD deviation variable for use in TDD Sigmoid curve based on current percent change between Daily TDD deviation and 2 Week Deviation 
    // This approach will normalize this variable for any TDD value to ensure a standard TDD Factor sigmoid curve
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
    
   } else { 
       var TDD_factor = weightedAverage / average_total_data; // the original Sigmoid approach
          }

// The Dynamic ISF Sigmoid Code 

      var ratioInterval = maximumRatio - minimumRatio;
      var max_minus_one = maximumRatio - 1;

   // DYNISF SIGMOID MODIFICATION #2
    // The TDD delta effect in the iAPS Chris Wilson (Logarithmic) DynISF approach allows ISF to shift when BG is below target BG (unlike the original Sigmoid DynamicISF approach). 
    // The following math applies the new TTD factor to the target BG to this shift.
    // Like the original Sigmoid approach, Profile ISF will be applied at target but only when Daily TDD = 2 Week TDD.  
    // ORIGINAL SIGMOID APPROACH: const bg_dev = (current_bg - profile.min_bg) * 0.0555;

    if (enable_new_sigmoidTDDFactor = true) {
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

    new_autosens_ratio = sigmoidFunction(adjustmentFactor, minimumRatio, maximumRatio, weightedAverage, average_total_data, past2hoursAverage);  
     
       
// **************** ROBOSURFER ENHANCEMENT #2: DYNAMIC SMB DELIVERY RATIO ****************
// Changes the setting SMB Delivery Ratio based on BG         

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


// **************** ROBOSURFER ENHANCEMENT #3: AUTOMATION #1: "NIGHTBOOST ****************
//Only use when enable_Automation_1 = true
if (enable_Automation_1) { 

   // Initialize Function Variables
   // User-defined Settings Changes 
        // Note: To reflect slower digestion and increased impact of carbs, CSF must increase
       // To do so while ISF strenghtens (decreases), CR must strenghten (decrease) as a % more than ISF
      var Automation_1_Autosens_Ratio = 1.3; // user-defined autosens ratio for Automation #1 that replaces autosens/dynamic ratio
      var Automation_1_CSF__StrengthFactor = 1.1; // % change factor used to calculate new CR; 1 = no change to CSF & CR will be adjusted in line with the ISF change. 1.1 is a 10% increase to CSF (carbs would have a ghreater impact on BG) and CR will be strengthened more than ISF to achieve this.
      var Automation_1_SMB_UAM_Minutes_Increase = 15; // Standard Automation #1 SMB/UAM Increase
      // var Automation_1_SMB_UAM_Minutes__Increase_ACCEL = 30; // High BG Rate of Change Automation #1 SMB/UAM Increase
      // var Automation_1_SMB_DeliveryRatio_Increase_ACCEL  = 1; // High BG Rate of Change SMB Delivery Ratio  
      var Automation_1_COB_Max = 100; // Automation #1 COB_Max
      var Automation_1_min_hourly_carb_absorption = 11; // Automation #1 min_hourly_carb_absorption. Option to change carb absorption e.g. slower after bedtime after late meals. Assumes use of constant_carb_absorption function

      if (now >= Automation_1_Start_Time && 
          myGlucose > Automation_1_BGThreshold &&
          cob >= Automation_1_CarbThreshold) {
            
            Automation_1_Status = "Nightboost On"; // Give the Automation a Name for use in return string
            Automation_1_isf_output = Automation_1_isf_Start / Automation_1_Autosens_Ratio;
            Automation_1_csf_output = Automation_1_csf_Start * Automation_1_CSF__StrengthFactor;
            Automation_1_cr_output =  Automation_1_isf_output /  Automation_1_csf_output;
            autosens.ratio = Automation_1_Autosens_Ratio;
            profile.sens = Automation_1_isf_output;
            profile.carb_ratio =  Automation_1_cr_output;  
            Automation_1_check_csf = profile.sens / profile.carb_ratio;
            profile.maxSMBBasalMinutes = Automation_1_maxSMB + Automation_1_SMB_UAM_Minutes_Increase;   
            profile.maxUAMSMBBasalMinutes = Automation_1_maxUAM + Automation_1_SMB_UAM_Minutes_Increase;   
            profile.maxCOB = Automation_1_COB_Max; 
            min_hourly_carb_absorption = Automation_1_min_hourly_carb_absorption; // 
            
          //   if (BG_accel >= Automation_1_BG_Accel_Threshold) {
          //     profile.sens = 
          //     profile.maxSMBBasalMinutes = Automation_1_maxSMB + Automation_1_SMB_UAM_Minutes__Increase_ACCEL
          //       profile.maxUAMSMBBasalMinutes = Automation_1_maxUAM + Automation_1_SMB_UAM_Minutes__Increase_ACCEL 
          //    }
       
        }       
      } 

             
// **************** ROBOSURFER ENHANCEMENT #4: SET CONSTANT MINIMUM HOURLY CARB ABSORPTION ****************
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

//******************* Set the New ISF *****************************     
    
   // Sets the new ISF 
     new_isf = round(isf / new_autosens_ratio,0);
     profile.sens = new_isf;  

    // Sets the autosens ratio to 1 for use by native Sigmoid, prevents any further adjustment to ISF
     autosens.ratio = 1;   
       
// **************** End RoboSurfer Enhancements ****************

return "Automation: " + Automation_Status + " Autosens ratio: " + round(autosens.ratio, 2) + ". Sens Protect is " + log_protectionmechanism + ". ISF set from: " + round(isf, 2) + " to " + round(profile.sens,2) + " TDD:" + round(past2hoursAverage, 2) + " Two-week TDD:" + round(average_total_data, 2) + " Weighted Average:" + round(weightedAverage, 2) + ". SMB Delivery Ratio: " + profile.smb_delivery_ratio + " Automation Start: " + Automation_1_Start_Time.toLocaleTimeString([],{hour: '2-digit', minute:'2-digit'}) + " Automation ISF: "  + round(profile.sens, 2) + " Automation CR: "  + round(profile.carb_ratio, 2) + " CSF Check: Profile CSF: "  + round(Automation_1_csf_Start, 2) + " Automation CSF: " + round(Automation_1_csf_output, 2) + " SMB Minutes: "  + round(profile.maxSMBBasalMinutes, 2) + " UAM Minutes: "  + round(profile.maxUAMSMBBasalMinutes, 2) + " SMB Delivery Ratio: "  + round(profile.smb_delivery_ratio, 2) + " Max COB: "  + round(profile.maxCOB, 2) + " Min Absorption: "  + round(min_hourly_carb_absorption, 2);
   
   }
}
