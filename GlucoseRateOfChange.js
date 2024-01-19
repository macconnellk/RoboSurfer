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
  const myGlucoseTime0 = glucose[0].dateString;
  const myGlucoseTime1 = glucose[1].dateString;
  const myGlucoseTime2 = glucose[2].dateString;
  const myGlucoseTime3 = glucose[3].dateString;
            
  const target = profile.min_bg;
  var smb_delivery_ratio = profile.smb_delivery_ratio;
  
 const dateString0 = "2024-01-18T23:07:34.412Z";
const dateString1 = "2024-01-19T01:30:45.789Z";

// Convert strings to Date objects
const date0 = new Date(dateString0);
const date1 = new Date(dateString1);

// Calculate time difference in milliseconds
const timeDifferenceMillis = date1 - date0;

// Convert milliseconds to days, hours, minutes, seconds
const days = Math.floor(timeDifferenceMillis / (1000 * 60 * 60 * 24));
const hours = Math.floor((timeDifferenceMillis % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
const minutes = Math.floor((timeDifferenceMillis % (1000 * 60 * 60)) / (1000 * 60));
const seconds = Math.floor((timeDifferenceMillis % (1000 * 60)) / 1000);

console.log(`Time difference: ${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds`);
return "Using Middleware function the glucose rate of change is: " + myGlucose0 + myGlucose1 + myGlucose2 + myGlucose3 + myGlucoseTime0 + myGlucoseTime1 + myGlucoseTime2 + myGlucoseTime3 + round(profile.smb_delivery_ratio, 2) + ".";

} 
  
