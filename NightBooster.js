function middleware(iob, currenttemp, glucose, profile, autosens, meal, reservoir, clock, pumphistory, preferences, basal_profile, oref2_variables) {

   function round(value, digits) {
        if (! digits) { digits = 0; }
        var scale = Math.pow(10, digits);
        return Math.round(value * scale) / scale; 
    }   

// NIGHTBOOSTER FUNCTION
//Turn on or off
  var enable_nightbooster = true;

//Only use when enable_robotune = true.
    if (enable_nightbooster) { 
   
//  Initialize function variables
   var myGlucose = glucose[0].glucose;
   var target = profile.min_bg;
   var isf = profile.sens;
