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
  
// User-Defined function settings
  const smb_delivery_ratio_min = profile.smb_delivery_ratio;
  const smb_delivery_ratio_max = 1;
  const smb_delivery_ratio_bg_range = 45;

// The Scaling Function

  // If BG between target and top of BG Range, scale SMB Delivery ratio
  if (myGlucose >= target && myGlucose <= (target+smb_delivery_ratio_bg_range)) {
        smb_delivery_ratio = (myGlucose - target) * ((smb_delivery_ratio_max - smb_delivery_ratio_min) / smb_delivery_ratio_bg_range) + smb_delivery_ratio_min;
   }

  // If BG above user-defined BG range, use SMB ratio max
  if (myGlucose > (target + smb_delivery_ratio_bg_range)) {
        smb_delivery_ratio = smb_delivery_ratio_max;
   }
  
  profile.smb_delivery_ratio = round(smb_delivery_ratio,2);
 
return "Using Middleware function the SMB delivery ratio has been adjusted to: " + round(profile.smb_delivery_ratio, 2) + ".";

} 
  

