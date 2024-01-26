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
   var average_Glucose_target = 120
   var target = profile.min_bg;
   var isf = profile.sens;
       
// Separate glucose and datestring elements into arrays
   glucose.forEach(element => {
    myGlucose.push(element.glucose);
    myGlucoseTime.push(new Date(element.datestring)); // Parse datestring to date object
      });      
       
   var test1 = myGlucose[50];
   var test2 = myGlucoseTime[50];
   var test3 = myGlucoseTime[60];    
   var testcalc = myGlucoseTime[2] - myGlucoseTime[0];
   return test1 + " " + test2 + " " + test3 + testcalc;
       
// Filter the data based on time ranges
const getCurrentTime = () => new Date().getTime();

const filterByTimeRange = (timeRange) => {
    const currentTime = getCurrentTime();
    const timeThreshold = currentTime - (timeRange * 60 * 60 * 1000);

    const filteredData = [];

    for (let i = 0; i < dateArray.length; i++) {
        const date = new Date(dateArray[i]).getTime();
        if (date >= timeThreshold) {
            filteredData.push({
                glucose: glucoseArray[i],
                datestring: dateArray[i]
            });
        }
    }

    return filteredData;
};

// Separate the data into time ranges (last 4 hours, 8 hours, 12 hours, 16 hours, 24 hours)
const last4HoursData = filterByTimeRange(4);
const last8HoursData = filterByTimeRange(8);
const last12HoursData = filterByTimeRange(12);
const last16HoursData = filterByTimeRange(16);
const last20HoursData = filterByTimeRange(20);       
const last24HoursData = filterByTimeRange(24);


return last4HoursData + last8HoursData + last12HoursData+ last16HoursData + last20HoursData + last24HoursData;

       
}
}
    
