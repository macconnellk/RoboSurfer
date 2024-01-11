function middleware(iob, currenttemp, glucose, profile, autosens, meal, reservoir, clock, pumphistory, preferences, basal_profile, oref2_variables) {

function round(value, digits) {
        if (! digits) { digits = 0; }
        var scale = Math.pow(10, digits);
        return Math.round(value * scale) / scale; 
    }

// For this function, the user should enter desired MIN CARB ABSORPTION in the min_5m_carbimpact setting instead of a min_5m_carbimpact.
// The function will define the min_5m_carbimpact needed for that MIN CARB ABSORPTION based on current ISF and CR.   
//  Initialize function variables
  const isf = const isf = profile.sens;
  const carb_factor = profile.carb_ratio;
  var min_carb_absorption = profile.min_5m_carbimpact;
   var min_5m_carbabsorption = 0;
  var min_5m_carbimpact = 0;

// The Constant Carb Absorption Function

  // Reduce hourly carb absorption to 5-minute carb absoorption
     min_5m_carbabsorption = min_carb_absorption / (60 / 5);

  // Calculate the dynamic min_5m_carbimpact
   min_5m_carbimpact = (min_5m_carbabsorption * isf) / carb_factor;
  
  profile.min_5m_carbimpact = round(min_5m_carbimpact,2);
 
return "Using Middleware function the min_5m_carbimpact has been adjusted to: " + round(profile.profile.min_5m_carbimpact, 2) + ".";

} 
  
