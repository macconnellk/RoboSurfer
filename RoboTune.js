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

// Initilize function variables
   var myGlucose = [];
   var myGlucoseTime = []; 
   var average_Glucose_target = 120;
   var target = profile.min_bg;
   var isf = profile.sens;
       
// Separate glucose and datestring elements into arrays
   glucose.forEach(element => {
    myGlucose.push(element.glucose);
    myGlucoseTime.push(new Date(element.dateString)); // Parse datestring to date object
      });      
       
       
// Filter the data based on time ranges and interpolate any gaps greater than 5 minutes
const filterByTimeRange = (timeRange, glucose, glucoseTime) => {
    const currentTime = new Date().getTime();
    const timeThreshold = currentTime - (timeRange * 60 * 60 * 1000);

    const filteredData = [];

    for (let i = 0; i < glucose.length; i++) {
        const date = new Date(glucoseTime[i]).getTime();
        if (date >= timeThreshold) {
            filteredData.push({ glucose: glucose[i], datestring: glucoseTime[i] });
        }
    }

    // Interpolate gaps greater than 5 minutes
    for (let i = 1; i < filteredData.length; i++) {
        const currentTime = new Date(filteredData[i].datestring).getTime();
        const prevTime = new Date(filteredData[i - 1].datestring).getTime();
        const timeDiff = (currentTime - prevTime) / (1000 * 60); // Difference in minutes

        if (timeDiff > 5) {
            const numInterpolatedPoints = Math.floor(timeDiff / 5) - 1; // Number of points to interpolate
            const glucoseDiff = (filteredData[i].glucose - filteredData[i - 1].glucose) / (numInterpolatedPoints + 1);

            for (let j = 1; j <= numInterpolatedPoints; j++) {
                const interpolatedTime = new Date(prevTime + j * 5 * 60 * 1000).toISOString(); // Add 5 minutes
                const interpolatedGlucose = filteredData[i - 1].glucose + glucoseDiff * j;
                filteredData.splice(i + (j - 1), 0, { glucose: interpolatedGlucose, datestring: interpolatedTime });
            }
        }
    }

    return filteredData;
};

// Separate the data into time ranges (last 4 hours, 8 hours, 12 hours, 16 hours, 20 hours, 24 hours)
const last4HoursData = filterByTimeRange(4, myGlucose, myGlucoseTime);
const last8HoursData = filterByTimeRange(8, myGlucose, myGlucoseTime);
const last12HoursData = filterByTimeRange(12, myGlucose, myGlucoseTime);
const last16HoursData = filterByTimeRange(16, myGlucose, myGlucoseTime);
const last20HoursData = filterByTimeRange(20, myGlucose, myGlucoseTime);
const last24HoursData = filterByTimeRange(24, myGlucose, myGlucoseTime);

// Return filtered and interpolated data for different time ranges
      return {
          last4HoursData,
          last8HoursData,
          last12HoursData,
          last16HoursData,
          last20HoursData,
          last24HoursData
      };
}
}   
    
