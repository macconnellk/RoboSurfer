function middleware(iob, currenttemp, glucose, profile, autosens, meal, reservoir, clock, pumphistory, preferences, basal_profile, oref2_variables) {

   function round(value, digits) {
        if (! digits) { digits = 0; }
        var scale = Math.pow(10, digits);
        return Math.round(value * scale) / scale; 
    }   

// ROBOTUNE
//Turn on or off
  var enable_robotune = true;

//Only use when enable_robotune = true.
    if (enable_robotune) { 
   
//  Initialize function variables
   
   var myGlucose = glucose.slice(0, 60).map(dataPoint => dataPoint.glucose);
   var myGlucoseTime = glucose.slice(0, 60).map(dataPoint => new Date(dataPoint.dateString).toISOString());        
   // var myGlucose = glucose[0].glucose;
   var average_Glucose_target = 120
   var target = profile.min_bg;
   var isf = profile.sens;

   var test = myGlucoseTime[2] - myGlucoseTime[0];
   return test;
       
 function GetAreaAboveTargetUnderCurve(myGlucoseTime, myGlucose, average_Glucose_target) {
    let area = 0;
    
    // Assuming 5-minute segments, and you want to measure for 5 hours
    const numSegments = Math.min(myGlucoseTime.length, 5 * 60 / 5); 

    for (let i = 1; i < numSegments - 1; i += 2) {
        if (myGlucose[i] > average_Glucose_target) {
            const h = myGlucoseTime[i + 1] - myGlucoseTime[i - 1];
            const areaSegment = (h / 3) * (myGlucose[i - 1] + 4 * myGlucose[i] + myGlucose[i + 1] - 3 * average_Glucose_target);
            area += Math.max(0, areaSegment); // Ensure area is non-negative

        }
    }

    return area;
   }

const resultArea = GetAreaAboveTargetUnderCurve(myGlucoseTime, myGlucose, average_Glucose_target);
return 'Area under the curve using Simpson\'s Rule: ' + resultArea;

       
}
}
    
