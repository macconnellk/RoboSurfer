function middleware(iob, currenttemp, glucose, profile, autosens, meal, reservoir, clock, pumphistory, preferences, basal_profile, oref2_variables) {

function round(value, digits) {
        if (! digits) { digits = 0; }
        var scale = Math.pow(10, digits);
        return Math.round(value * scale) / scale; 
    }

//  Initialize function variables
  const myGlucose0 = glucose[0].glucose;
  const myGlucose1 = glucose[1].glucose;
  const myGlucose2 = glucose[2].glucose;
  const myGlucose3 = glucose[3].glucose;
  const myGlucoseTime0 = glucose[0].datestring;
  const myGlucoseTime1 = glucose[1].datestring;
  const myGlucoseTime2 = glucose[2].datestring;
  const myGlucoseTime3 = glucose[3].datestring;
            
  const target = profile.min_bg;
  var smb_delivery_ratio = profile.smb_delivery_ratio;
  
 
return "Using Middleware function the glucose rate of change is: " + myGlucose0 + myGlucose1 + myGlucose2 + myGlucose3 + myGlucoseTime0 + myGlucoseTime1 + myGlucoseTime2 + myGlucoseTime3 + round(profile.smb_delivery_ratio, 2) + ".";

} 
  
