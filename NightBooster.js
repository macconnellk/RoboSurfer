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

//  Initialize user-defined settings
   var NightBoostStartTimeHour = 20; // 8pm
   var NightBoostStartTimeMinute = 0; // 8:00pm
   var NightBoostCarbThreshold = 30; // COB
   var NightBoostBGThreshold = 140; // BG over
   var NightBoostDeviation = 0; // TBD  
       
//  Initialize function variables
   var myGlucose = glucose[0].glucose;
   var target = profile.min_bg;
   var isf = profile.sens;
   var COB = meal.carbs;    
   const now = new Date();
   const StartNightBooster = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0, 0); // 8:00 PM

  if (now > StartNightBooster && COB > NightBoostCarbThreshold && myGlucose > NightBoostBGThreshold) {
    
  }
}

// increase SMBs 
// Increase SMB delivery ratio scaling
// Decrease carb absorption
// Decrease ISF

       
       

   return "_ set to: " + round(_, 2);
    } 
}
