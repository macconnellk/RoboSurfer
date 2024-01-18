function middleware(iob, currenttemp, glucose, profile, autosens, meal, reservoir, clock, pumphistory, preferences, basal_profile, oref2_variables) {

function round(value, digits) {
        if (! digits) { digits = 0; }
        var scale = Math.pow(10, digits);
        return Math.round(value * scale) / scale; 
    }

//  Initialize function variables
  const myGlucose = glucose[0].glucose;
  const target = profile.min_bg;
  var smb_delivery_ratio = profile.smb_delivery_ratio;
  

 
return "Using Middleware function the glucose rate of change is: " + round(profile.smb_delivery_ratio, 2) + ".";

} 
  
