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
   var myGlucose = glucose[0].glucose;
   var target = profile.min_bg;
   var isf = profile.sens;


 function AreaAboveTargetUnderCurve(time, magnitude, threshold) {
    let area = 0;

    // Assuming 5-minute segments, and you want to measure for 5 hours
    const numSegments = Math.min(time.length, 5 * 60 / 5); 

    for (let i = 1; i < numSegments - 1; i += 2) {
        if (magnitude[i] > threshold) {
            const h = time[i + 1] - time[i - 1];
            const areaSegment = (h / 3) * (magnitude[i - 1] + 4 * magnitude[i] + magnitude[i + 1] - 3 * threshold);
            area += Math.max(0, areaSegment); // Ensure area is non-negative
        }
    }

    return area;
}

// Example usage
const timeData = [/* your time data array */];
const magnitudeData = [/* your magnitude data array */];
const thresholdValue = /* your threshold value */;
const resultArea = simpsonsRule(timeData, magnitudeData, thresholdValue);

console.log('Area under the curve using Simpson\'s Rule:', resultArea);

Simpler approach using rectangles:
function calculateArea(time, magnitude, threshold) {
    let area = 0;

    for (let i = 1; i < time.length; i++) {
        if (magnitude[i] > threshold) {
            const height = magnitude[i] - threshold;
            const width = time[i] - time[i - 1];
            area += height * width;
        }
    }

    return area;
}


    
