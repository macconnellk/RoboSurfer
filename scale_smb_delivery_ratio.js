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
  const smb_delivery_ratio_scale_start_bg = 160
  const smb_delivery_ratio_max = .75;
  const smb_delivery_ratio_bg_range = 100;

// The Scaling Function

  // If BG between start bg and top of BG Range, scale SMB Delivery ratio
  if (myGlucose >= smb_delivery_ratio_scale_start_bg && myGlucose <= (smb_delivery_ratio_scale_start_bg + smb_delivery_ratio_bg_range)) {
        smb_delivery_ratio = (myGlucose - smb_delivery_ratio_scale_start_bg) * ((smb_delivery_ratio_max - smb_delivery_ratio_min) / smb_delivery_ratio_bg_range) + smb_delivery_ratio_min;
   }

  // If BG above user-defined BG range, use SMB ratio max
  if (myGlucose > (smb_delivery_ratio_scale_start_bg + smb_delivery_ratio_bg_range)) {
        smb_delivery_ratio = smb_delivery_ratio_max;
   }
  
  profile.smb_delivery_ratio = round(smb_delivery_ratio,2);
 
return "Using Middleware function the SMB delivery ratio has been adjusted to: " + round(profile.smb_delivery_ratio, 2) + ".";

} 
  

