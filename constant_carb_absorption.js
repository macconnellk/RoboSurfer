function middleware(iob, currenttemp, glucose, profile, autosens, meal, reservoir, clock, pumphistory, preferences, basal_profile, oref2_variables) {

function round(value, digits) {
        if (! digits) { digits = 0; }
        var scale = Math.pow(10, digits);
        return Math.round(value * scale) / scale; 
    }

// The function will define the min_5m_carbimpact needed for the user-defined MIN CARB ABSORPTION based on current ISF and CR.   

//  User-defined function variables        
// Define the minimum amount of carb you wamt iAPS to decay in 1 hour.
var min_carb_absorption = 24;
        
//  Initialize function variables
  const isf = profile.sens;
  const carb_factor = profile.carb_ratio;
  var min_5m_carbimpact = 0;

// The Constant Carb Absorption Function

  // Reduce hourly carb absorption to 5-minute carb absoorption
     min_5m_carbabsorption = min_carb_absorption / (60 / 5);

  // Calculate the dynamic min_5m_carbimpact
   min_5m_carbimpact = (min_5m_carbabsorption * isf) / carb_factor;
  
  profile.min_5m_carbimpact = round(min_5m_carbimpact,2);
 
return "Using RoboSurfer the min_5m_carbimpact has been adjusted to: " + round(profile.min_5m_carbimpact, 2) + ".";

} 
  
