function middleware(iob, currenttemp, glucose, profile, autosens, meal, reservoir, clock, pumphistory, preferences, basal_profile, oref2_variables) {

   function round(value, digits) {
        if (! digits) { digits = 0; }
        var scale = Math.pow(10, digits);
        return Math.round(value * scale) / scale; 
    }   

// DYNAMIC ISF: SIGMOID WITH ENHANCED TDD RESPONSE
//Turn on or off
  var enable_sigmoidTDD = true;

//Only use when enable_sigmoidTDD = true.
    if (enable_sigmoidTDD) { 
   
   //  Initialize log variables  
   var log_new_isf = "";
   var log_protectionmechanism = "Protection Mechanism is Off";
   
//  Initialize function variables
   var target = profile.min_bg;
   var past2hoursAverage = oref2_variables.past2hoursAverage;
   var average_total_data = oref2_variables.average_total_data;
   var weightedAverage = oref2_variables.weightedAverage;
   var isf = profile.sens;
              
// Exception logic if past2hoursAverage not calculating
      if (past2hoursAverage < 1) {
         weightedAverage = average_total_data;
         var log_protectionmechanism = "OnZero";
      }

// Sensitivity Protection Mechanism: If 24hr TDD is less than 2-Week TDD (more sensitive), set weighted average TDD to the 24hr TDD value)
   if (past2hoursAverage < average_total_data) {
      weightedAverage = past2hoursAverage;
      var log_protectionmechanism = "On";
   }
    
// TDD-Factor Sigmoid Function
     
// DYNISF SIGMOID MODIFICATION #1
// Define a TDD Factor using a Sigmoid curve that approximates the TDD delta effect used in the Chris Wilson DynISF approach.
// This TDD delta effect is not linear across BGs and requires a curve to mimic.
// ORIGINAL SIGMOID APPROACH: const tdd_factor = tdd_averages.weightedAverage / tdd_averages.average_total_data;

    // Define TDD deviation variable for use in TDD Sigmoid curve based on current percent change between Daily TDD deviation and 2 Week Deviation 
    // This approach will normalize this variable for any TDD value to ensure a standard TDD Factor sigmoid curve for all users
   const tdd_dev = (weightedAverage / average_total_data - 1) * 10;

    // Hard-code TDD Factor Sigmoid inputs
    // These inputs have been modeled to create a TDD Factor that, when used in the Sigmoid DynISF function, closely approximates the TDD delta effect for ULTRA-RAPID used in the Chris Wilson (Logarithmic) DynISF approach. 
    // These inputs are not expected to require user change for ultra-rapid insulin; instead the strength of this factor can be modified below using the tdd_factor_strength_slider.
    // To model the effects of any changes to these values, or adjust for RAPID insulin, see: https://docs.google.com/spreadsheets/d/1k4sGaZYf2t-FbfY8rViqvUnARx_Gu5K_869AH2wgg_A/edit?usp=sharing
    const TDD_sigmoid_adjustment_factor = .41;
    const TDD_sigmoid_max = 3.25;
    const TDD_sigmoid_min = .7;
       
    // Define a TDD Factor Sigmoid curve using same method as the DynISF Sigmoid approach below
    const TDD_sigmoid_interval = TDD_sigmoid_max - TDD_sigmoid_min;
    const TDD_sigmoid_max_minus_one = TDD_sigmoid_max - 1;
    const TDD_sigmoid_fix_offset = (Math.log10(1/TDD_sigmoid_max_minus_one - TDD_sigmoid_min / TDD_sigmoid_max_minus_one) / Math.log10(Math.E));
    const TDD_sigmoid_exponent = tdd_dev * TDD_sigmoid_adjustment_factor + TDD_sigmoid_fix_offset;
       
    // The TDD Factor sigmoid function
    const TDD_factor = TDD_sigmoid_interval / (1 + Math.exp(-TDD_sigmoid_exponent)) + TDD_sigmoid_min;

// DYNISF SIGMOID MODIFICATION #2
// The TDD delta effect in Chris Wilson (Logarithmic) DynISF approach allows ISF to shift when BG is below target BG (unlike the original Sigmoid DynamicISF approach). 
// The following math applies the new TTD factor to the target BG to enable this shift.
// Profile ISF will be applied at target only when Daily TDD = 2 Week TDD. 

       profile.min_bg = target / TDD_factor
       profile.sens = isf / TDD_factor
        
       
// Dynamic CR. Use only when the setting 'Enable Dyanmic CR' is on in FAX Dynamic Settings
       const normal_cr = profile.carb_ratio;
      
        if (autosens.ratio > 1 && enableDynCR) {
            profile.carb_ratio /= ((autosens.ratio - 1) / 2 + 1);
        } else if (enableDynCR) { profile.carb_ratio /= autosens.ratio; }  
                   
 return "TDD Factor set to: " + round(TDD_factor, 2) + ". Sigmoid Target set to: " + round(profile.min_bg, 2) + ". Sigmoid ISF set to: " + round(profile.sens, 2) + ". CR adjusted from " + round(normal_cr,2) + " to " + round(profile.carb_ratio,2) + " 24hr TDD: " + round(past2hoursAverage, 2) + " 2-week TDD: " + round(average_total_data, 2) + " TDD Weighted Average: " + round(weightedAverage, 2) + log_protectionmechanism;
    } 
}
